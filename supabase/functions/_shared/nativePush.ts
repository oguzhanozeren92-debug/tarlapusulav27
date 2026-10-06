type SupabaseAdmin = any;

export type NativePushPayload = Record<string, unknown>;

type FcmCredentials = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

type ApnsCredentials = {
  keyId: string;
  teamId: string;
  privateKey: string;
  bundleId: string;
};

function base64UrlBytes(bytes: Uint8Array) {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlJson(value: unknown) {
  return base64UrlBytes(
    new TextEncoder().encode(JSON.stringify(value)),
  );
}

function pemBytes(value: string) {
  const body = String(value || "")
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");

  if (!body) throw new Error("Push private key is empty.");

  const binary = atob(body);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function signJwt(
  algorithm: "RS256" | "ES256",
  header: Record<string, unknown>,
  claims: Record<string, unknown>,
  privateKeyPem: string,
) {
  const unsigned = `${base64UrlJson(header)}.${base64UrlJson(claims)}`;
  const bytes = new TextEncoder().encode(unsigned);

  if (algorithm === "RS256") {
    const key = await crypto.subtle.importKey(
      "pkcs8",
      pemBytes(privateKeyPem),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      bytes,
    );

    return `${unsigned}.${base64UrlBytes(new Uint8Array(signature))}`;
  }

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemBytes(privateKeyPem),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    bytes,
  );

  return `${unsigned}.${base64UrlBytes(new Uint8Array(signature))}`;
}

function fcmCredentials(): FcmCredentials | null {
  const serviceAccountRaw =
    Deno.env.get("FCM_SERVICE_ACCOUNT_JSON") || "";

  if (serviceAccountRaw) {
    try {
      const parsed = JSON.parse(serviceAccountRaw);
      const projectId = String(parsed.project_id || "").trim();
      const clientEmail = String(parsed.client_email || "").trim();
      const privateKey = String(parsed.private_key || "").trim();

      if (projectId && clientEmail && privateKey) {
        return { projectId, clientEmail, privateKey };
      }
    } catch (error) {
      console.error("FCM_SERVICE_ACCOUNT_JSON parse error:", error);
    }
  }

  const projectId = String(Deno.env.get("FCM_PROJECT_ID") || "").trim();
  const clientEmail = String(Deno.env.get("FCM_CLIENT_EMAIL") || "").trim();
  const privateKey = String(Deno.env.get("FCM_PRIVATE_KEY") || "").trim();

  return projectId && clientEmail && privateKey
    ? { projectId, clientEmail, privateKey }
    : null;
}

let fcmTokenCache:
  | { value: string; expiresAt: number }
  | null = null;

async function getFcmAccessToken(credentials: FcmCredentials) {
  if (
    fcmTokenCache &&
    fcmTokenCache.expiresAt > Date.now() + 60_000
  ) {
    return fcmTokenCache.value;
  }

  const now = Math.floor(Date.now() / 1000);
  const assertion = await signJwt(
    "RS256",
    { alg: "RS256", typ: "JWT" },
    {
      iss: credentials.clientEmail,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    },
    credentials.privateKey,
  );

  const response = await fetch(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    },
  );

  const body = await response.json();
  if (!response.ok || !body?.access_token) {
    throw new Error(
      `FCM OAuth failed (${response.status}): ${
        body?.error_description || body?.error || "unknown"
      }`,
    );
  }

  const expiresIn = Math.max(300, Number(body.expires_in || 3600));
  fcmTokenCache = {
    value: String(body.access_token),
    expiresAt: Date.now() + expiresIn * 1000,
  };

  return fcmTokenCache.value;
}

function stringData(payload: NativePushPayload) {
  const data: Record<string, string> = {};

  for (const [key, value] of Object.entries(payload)) {
    if (value === null || value === undefined) continue;

    data[key] =
      typeof value === "string"
        ? value
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);
  }

  return data;
}

async function sendFcmNotification(
  token: string,
  payload: NativePushPayload,
  critical: boolean,
) {
  const credentials = fcmCredentials();

  if (!credentials) {
    return {
      sent: false,
      unavailable: true,
      invalidToken: false,
      error: "fcm_credentials_missing",
    };
  }

  const accessToken = await getFcmAccessToken(credentials);
  const title = String(payload.title || "TarlaPusula");
  const body = String(
    payload.body || "Pusula yeni bir gelişme fark etti.",
  );

  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${
      encodeURIComponent(credentials.projectId)
    }/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          data: stringData(payload),
          android: {
            priority: critical ? "high" : "normal",
            notification: {
              channel_id: "tarlapusula_general",
              sound: "default",
              tag: String(
                payload.tag ||
                  payload.notificationId ||
                  "tarlapusula",
              ),
            },
          },
        },
      }),
    },
  );

  const text = await response.text();

  if (response.ok) {
    return {
      sent: true,
      unavailable: false,
      invalidToken: false,
      error: null,
    };
  }

  const invalidToken =
    response.status === 404 ||
    /UNREGISTERED|registration-token-not-registered/i.test(text);

  console.error(
    "FCM push error:",
    response.status,
    text.slice(0, 800),
  );

  return {
    sent: false,
    unavailable: false,
    invalidToken,
    error: `fcm_${response.status}`,
  };
}

function apnsCredentials(): ApnsCredentials | null {
  const keyId = String(Deno.env.get("APNS_KEY_ID") || "").trim();
  const teamId = String(Deno.env.get("APNS_TEAM_ID") || "").trim();
  const privateKey = String(
    Deno.env.get("APNS_PRIVATE_KEY") || "",
  ).trim();
  const bundleId = String(
    Deno.env.get("APNS_BUNDLE_ID") ||
      "com.tarlapusula.app",
  ).trim();

  return keyId && teamId && privateKey && bundleId
    ? { keyId, teamId, privateKey, bundleId }
    : null;
}

let apnsJwtCache:
  | {
      value: string;
      expiresAt: number;
      fingerprint: string;
    }
  | null = null;

async function getApnsJwt(credentials: ApnsCredentials) {
  const fingerprint =
    `${credentials.teamId}:${credentials.keyId}`;

  if (
    apnsJwtCache &&
    apnsJwtCache.fingerprint === fingerprint &&
    apnsJwtCache.expiresAt > Date.now() + 60_000
  ) {
    return apnsJwtCache.value;
  }

  const now = Math.floor(Date.now() / 1000);

  const jwt = await signJwt(
    "ES256",
    {
      alg: "ES256",
      kid: credentials.keyId,
    },
    {
      iss: credentials.teamId,
      iat: now,
    },
    credentials.privateKey,
  );

  apnsJwtCache = {
    value: jwt,
    expiresAt: Date.now() + 45 * 60 * 1000,
    fingerprint,
  };

  return jwt;
}

async function sendApnsNotification(
  token: string,
  environment: string,
  payload: NativePushPayload,
  critical: boolean,
) {
  const credentials = apnsCredentials();

  if (!credentials) {
    return {
      sent: false,
      unavailable: true,
      invalidToken: false,
      error: "apns_credentials_missing",
    };
  }

  const jwt = await getApnsJwt(credentials);
  const host =
    environment === "sandbox"
      ? "https://api.sandbox.push.apple.com"
      : "https://api.push.apple.com";

  const title = String(payload.title || "TarlaPusula");
  const body = String(
    payload.body || "Pusula yeni bir gelişme fark etti.",
  );

  const customPayload = { ...payload };
  delete customPayload.title;
  delete customPayload.body;

  const response = await fetch(
    `${host}/3/device/${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: {
        Authorization: `bearer ${jwt}`,
        "apns-topic": credentials.bundleId,
        "apns-push-type": "alert",
        "apns-priority": critical ? "10" : "10",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        aps: {
          alert: { title, body },
          sound: "default",
          "thread-id": "tarlapusula",
        },
        ...customPayload,
      }),
    },
  );

  const text = await response.text();

  if (response.ok) {
    return {
      sent: true,
      unavailable: false,
      invalidToken: false,
      error: null,
    };
  }

  const invalidToken =
    response.status === 410 ||
    /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/i.test(
      text,
    );

  console.error(
    "APNs push error:",
    response.status,
    text.slice(0, 800),
  );

  return {
    sent: false,
    unavailable: false,
    invalidToken,
    error: `apns_${response.status}`,
  };
}

export async function sendNativePushToUser(
  supabaseAdmin: SupabaseAdmin,
  userId: string,
  payload: NativePushPayload,
  options: { critical?: boolean } = {},
) {
  const { data: tokens, error } = await supabaseAdmin
    .from("native_push_tokens")
    .select("id,platform,token,environment")
    .eq("user_id", userId)
    .eq("enabled", true);

  if (error) {
    // Migration henüz uygulanmamış bir ortam web push'u bozmamalı.
    console.info(
      "Native push tokenları okunamadı:",
      error.message,
    );

    return {
      sent: 0,
      failed: 0,
      available: 0,
      registered: 0,
    };
  }

  let sent = 0;
  let failed = 0;
  let available = 0;
  let registered = 0;

  for (const row of tokens ?? []) {
    const platform = String(row.platform || "");
    const token = String(row.token || "").trim();

    if (!token) continue;
    registered++;

    try {
      const result =
        platform === "ios"
          ? await sendApnsNotification(
              token,
              String(row.environment || "production"),
              payload,
              Boolean(options.critical),
            )
          : platform === "android"
            ? await sendFcmNotification(
                token,
                payload,
                Boolean(options.critical),
              )
            : null;

      if (!result) continue;
      if (!result.unavailable) available++;

      if (result.sent) {
        sent++;

        await supabaseAdmin
          .from("native_push_tokens")
          .update({
            last_seen_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
      } else if (result.invalidToken) {
        failed++;

        await supabaseAdmin
          .from("native_push_tokens")
          .update({
            enabled: false,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
      } else if (!result.unavailable) {
        failed++;
      }
    } catch (error) {
      failed++;
      available++;

      console.error(
        "Native push gönderim hatası:",
        platform,
        error,
      );
    }
  }

  return {
    sent,
    failed,
    available,
    registered,
  };
}

export async function listNativePushUserIds(
  supabaseAdmin: SupabaseAdmin,
  limit = 500,
) {
  const { data, error } = await supabaseAdmin
    .from("native_push_tokens")
    .select("user_id")
    .eq("enabled", true)
    .limit(limit);

  if (error) {
    console.info(
      "Native push kullanıcıları okunamadı:",
      error.message,
    );
    return [] as string[];
  }

  return Array.from(
    new Set(
      (data ?? [])
        .map((row: any) => String(row.user_id || "").trim())
        .filter(Boolean),
    ),
  ) as string[];
}
