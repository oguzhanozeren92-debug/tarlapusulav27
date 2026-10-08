import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.112.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
  });

const ALLOWED_PLACEMENTS = new Set([
  'points_hub',
  'ai_extra_analysis',
  'satellite_history',
  'agenda_deep_read',
]);

const ADMOB_KEYS_URL =
  'https://www.gstatic.com/admob/reward/verifier-keys.json';

let admobKeyCache:
  | {
      expiresAt: number;
      keys: Map<number, string>;
    }
  | null = null;

function clean(value: unknown, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function base64UrlBytes(value: string) {
  const normalized = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');

  const binary = atob(normalized);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function pemDer(pem: string) {
  const body = pem
    .replace(/-----BEGIN PUBLIC KEY-----/g, '')
    .replace(/-----END PUBLIC KEY-----/g, '')
    .replace(/\s+/g, '');

  const binary = atob(body);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function derLength(bytes: Uint8Array, offset: number) {
  const first = bytes[offset];

  if ((first & 0x80) === 0) {
    return { length: first, bytesRead: 1 };
  }

  const count = first & 0x7f;
  if (!count || count > 4) throw new Error('Invalid DER length.');

  let length = 0;
  for (let i = 0; i < count; i += 1) {
    length = (length << 8) | bytes[offset + 1 + i];
  }

  return { length, bytesRead: count + 1 };
}

function derEcdsaToRaw(signature: Uint8Array) {
  let offset = 0;

  if (signature[offset++] !== 0x30) {
    throw new Error('Invalid ECDSA DER sequence.');
  }

  const sequence = derLength(signature, offset);
  offset += sequence.bytesRead;

  if (signature[offset++] !== 0x02) {
    throw new Error('Invalid ECDSA R component.');
  }

  const rLength = derLength(signature, offset);
  offset += rLength.bytesRead;
  let r = signature.slice(offset, offset + rLength.length);
  offset += rLength.length;

  if (signature[offset++] !== 0x02) {
    throw new Error('Invalid ECDSA S component.');
  }

  const sLength = derLength(signature, offset);
  offset += sLength.bytesRead;
  let s = signature.slice(offset, offset + sLength.length);

  while (r.length > 32 && r[0] === 0) r = r.slice(1);
  while (s.length > 32 && s[0] === 0) s = s.slice(1);

  if (r.length > 32 || s.length > 32) {
    throw new Error('Invalid ECDSA component length.');
  }

  const raw = new Uint8Array(64);
  raw.set(r, 32 - r.length);
  raw.set(s, 64 - s.length, 32);
  return raw;
}

async function fetchAdMobKeys() {
  if (admobKeyCache && admobKeyCache.expiresAt > Date.now()) {
    return admobKeyCache.keys;
  }

  const response = await fetch(ADMOB_KEYS_URL, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`AdMob key server HTTP ${response.status}`);
  }

  const payload = await response.json();
  const keys = new Map<number, string>();

  for (const row of Array.isArray(payload?.keys) ? payload.keys : []) {
    const keyId = Number(row?.keyId);
    const pem = clean(row?.pem, 10_000);

    if (Number.isFinite(keyId) && pem) {
      keys.set(keyId, pem);
    }
  }

  if (!keys.size) {
    throw new Error('AdMob doğrulama anahtarı bulunamadı.');
  }

  admobKeyCache = {
    keys,
    expiresAt: Date.now() + 23 * 60 * 60 * 1000,
  };

  return keys;
}

async function verifyAdMobSignature(req: Request) {
  const url = new URL(req.url);
  const rawQuery = url.search.startsWith('?')
    ? url.search.slice(1)
    : url.search;

  const signatureMarker = '&signature=';
  const signatureIndex = rawQuery.indexOf(signatureMarker);

  if (signatureIndex < 0) {
    throw new Error('AdMob signature parametresi eksik.');
  }

  const signedContent = rawQuery.slice(0, signatureIndex);
  const signatureAndKey = rawQuery.slice(signatureIndex + 1);
  const tail = new URLSearchParams(signatureAndKey);

  const signatureText = tail.get('signature') ?? '';
  const keyId = Number(tail.get('key_id'));

  if (!signatureText || !Number.isFinite(keyId)) {
    throw new Error('AdMob signature/key_id geçersiz.');
  }

  const keys = await fetchAdMobKeys();
  const pem = keys.get(keyId);

  if (!pem) {
    admobKeyCache = null;
    const refreshed = await fetchAdMobKeys();
    const retryPem = refreshed.get(keyId);
    if (!retryPem) {
      throw new Error(`AdMob key_id bulunamadı: ${keyId}`);
    }
    return verifyEcdsa(retryPem, signedContent, signatureText);
  }

  return verifyEcdsa(pem, signedContent, signatureText);
}

async function verifyEcdsa(
  pem: string,
  signedContent: string,
  signatureText: string,
) {
  const key = await crypto.subtle.importKey(
    'spki',
    pemDer(pem),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );

  const message = new TextEncoder().encode(signedContent);
  const derSignature = base64UrlBytes(signatureText);

  // WebCrypto implementations use IEEE-P1363 raw signatures. Try both
  // encodings so Supabase/Deno upgrades cannot silently break verification.
  const candidates = [derSignature];

  try {
    candidates.push(derEcdsaToRaw(derSignature));
  } catch {
    // DER parsing failure is handled by the verification result below.
  }

  for (const signature of candidates) {
    try {
      const valid = await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        key,
        signature,
        message,
      );

      if (valid) return true;
    } catch {
      // Try the other supported signature representation.
    }
  }

  return false;
}

function allowedAdMobUnits() {
  const configured = clean(
    Deno.env.get('ADMOB_REWARDED_AD_UNIT_IDS'),
    4000,
  );

  // Ad unit IDs are public identifiers, not secrets. Keep TarlaPusula's
  // production rewarded units as a safe baseline and allow env additions.
  const values = [
    'ca-app-pub-9321324588059191/4148774701',
    'ca-app-pub-9321324588059191/9153689375',
    ...configured
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  ];

  const allowed = new Set<string>();

  for (const value of values) {
    allowed.add(value);
    const suffix = value.includes('/') ? value.split('/').pop() : null;
    if (suffix) allowed.add(suffix);
  }

  return allowed;
}

function parseAdMobCustomData(value: string) {
  let decoded: any = null;

  try {
    decoded = JSON.parse(value);
  } catch {
    throw new Error('AdMob custom_data JSON geçersiz.');
  }

  const placement = clean(decoded?.p, 80);
  const nonce = clean(decoded?.n, 160);

  if (!ALLOWED_PLACEMENTS.has(placement)) {
    throw new Error('AdMob placement geçersiz.');
  }

  if (!/^[a-zA-Z0-9._:-]{8,160}$/.test(nonce)) {
    throw new Error('AdMob nonce geçersiz.');
  }

  return { placement, nonce };
}

function isAdMobVerificationProbe(req: Request) {
  const url = new URL(req.url);
  const params = url.searchParams;

  // AdMob's dashboard URL verifier uses fixed dummy identifiers and omits
  // user/custom data. Do not rely on User-Agent because some proxies rewrite it.
  // This branch never awards a reward or writes a receipt.
  return (
    params.get('ad_network') === '5450213213286189855' &&
    params.get('ad_unit') === '1234567890' &&
    params.get('transaction_id') === '123456789' &&
    !params.get('user_id') &&
    !params.get('custom_data')
  );
}

async function processAdMobSsv(
  req: Request,
  admin: ReturnType<typeof createClient>,
) {
  // AdMob dashboard's "Verify URL" tool sends a signed connectivity probe
  // with fixed dummy identifiers and no user/custom data. It must receive 2xx,
  // but it must never create a reward receipt or award points.
  if (isAdMobVerificationProbe(req)) {
    return json(
      {
        ok: true,
        verificationProbe: true,
      },
      200,
    );
  }

  const validSignature = await verifyAdMobSignature(req);

  if (!validSignature) {
    return json({ ok: false, error: 'AdMob SSV imzası geçersiz.' }, 401);
  }

  const url = new URL(req.url);
  const params = url.searchParams;

  const userId = clean(params.get('user_id'), 80);
  const transactionId = clean(params.get('transaction_id'), 220);
  const adUnit = clean(params.get('ad_unit'), 220);
  const customData = params.get('custom_data') ?? '';
  const rewardAmount = Number(params.get('reward_amount') ?? 0);
  const rewardItem = clean(params.get('reward_item'), 120);
  const timestamp = Number(params.get('timestamp') ?? 0);

  if (!isUuid(userId)) {
    return json({ ok: false, error: 'AdMob user_id geçersiz.' }, 400);
  }

  if (!transactionId || !adUnit) {
    return json({ ok: false, error: 'AdMob transaction/ad_unit eksik.' }, 400);
  }

  const allowedUnits = allowedAdMobUnits();

  if (!allowedUnits.size) {
    return json(
      {
        ok: false,
        error: 'ADMOB_REWARDED_AD_UNIT_IDS henüz yapılandırılmadı.',
      },
      503,
    );
  }

  if (!allowedUnits.has(adUnit)) {
    return json({ ok: false, error: 'Bu AdMob ad unit yetkili değil.' }, 403);
  }

  if (
    Number.isFinite(timestamp) &&
    timestamp > 0 &&
    Math.abs(Date.now() - timestamp) > 24 * 60 * 60 * 1000
  ) {
    return json({ ok: false, error: 'AdMob SSV zaman damgası geçersiz.' }, 400);
  }

  const { placement, nonce } = parseAdMobCustomData(customData);

  const { data: existing } = await admin
    .from('admob_reward_receipts')
    .select('nonce')
    .eq('provider_transaction_id', transactionId)
    .maybeSingle();

  if (existing?.nonce) {
    return json({ ok: true, duplicate: true }, 200);
  }

  const { data, error } = await admin.rpc('tp_award_verified_ad_reward', {
    p_user_id: userId,
    p_provider: 'admob',
    p_provider_transaction_id: transactionId,
    p_placement: placement,
    p_metadata: {
      verification_mode: 'admob_ssv',
      nonce,
      ad_unit: adUnit,
      reward_amount: rewardAmount,
      reward_item: rewardItem,
      ad_network: clean(params.get('ad_network'), 120),
      timestamp,
    },
  });

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;

  const { error: receiptError } = await admin
    .from('admob_reward_receipts')
    .upsert(
      {
        nonce,
        user_id: userId,
        placement,
        provider_transaction_id: transactionId,
        ad_unit: adUnit,
        reward_amount: Number.isFinite(rewardAmount) ? rewardAmount : null,
        reward_item: rewardItem || null,
        awarded: Boolean(row?.awarded),
        awarded_points: Number(row?.awarded_points ?? 0),
        reason: String(row?.reason ?? 'unknown'),
        points: Number(row?.points ?? 0),
        lifetime_points: Number(row?.lifetime_points ?? 0),
        daily_count: Number(row?.daily_count ?? 0),
        daily_limit: Number(row?.daily_limit ?? 5),
        ai_credit_granted: Boolean(row?.ai_credit_granted),
        verified_at: new Date().toISOString(),
        metadata: {
          verification_mode: 'admob_ssv',
          key_id: clean(params.get('key_id'), 80),
        },
      },
      { onConflict: 'nonce' },
    );

  if (receiptError) throw receiptError;

  return json({ ok: true }, 200);
}

async function authenticatedClients(req: Request) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const authorization = req.headers.get('Authorization') ?? '';

  if (!supabaseUrl || !anonKey || !serviceKey) {
    throw new Error('Reklam ödülü sunucu yapılandırması eksik.');
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (!authorization) {
    return { admin, userClient: null, user: null };
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await userClient.auth.getUser();

  return {
    admin,
    userClient,
    user: error ? null : data.user,
  };
}

async function pollAdMobReceipt(
  admin: ReturnType<typeof createClient>,
  userId: string,
  nonce: string,
) {
  const { data, error } = await admin
    .from('admob_reward_receipts')
    .select(
      'awarded,awarded_points,reason,points,lifetime_points,daily_count,daily_limit,ai_credit_granted',
    )
    .eq('user_id', userId)
    .eq('nonce', nonce)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    return json(
      {
        ok: true,
        pending: true,
        awarded: false,
        awardedPoints: 0,
        reason: 'ssv_pending',
      },
      202,
    );
  }

  return json({
    ok: true,
    pending: false,
    awarded: Boolean(data.awarded),
    awardedPoints: Number(data.awarded_points ?? 0),
    reason: String(data.reason ?? 'unknown'),
    points: Number(data.points ?? 0),
    lifetimePoints: Number(data.lifetime_points ?? 0),
    dailyCount: Number(data.daily_count ?? 0),
    dailyLimit: Number(data.daily_limit ?? 5),
    aiCreditGranted: Boolean(data.ai_credit_granted),
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  try {
    const { admin, userClient, user } = await authenticatedClients(req);

    if (req.method === 'GET') {
      return await processAdMobSsv(req, admin);
    }

    if (req.method !== 'POST') {
      return json({ ok: false, error: 'Yalnız GET/POST desteklenir.' }, 405);
    }

    if (!user || !userClient) {
      return json({ ok: false, error: 'Geçerli kullanıcı oturumu gerekli.' }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const placement = clean(body?.placement, 80);
    const provider = clean(body?.provider, 80);
    const transactionId = clean(
      body?.transactionId ?? body?.transaction_id,
      220,
    );
    const verificationPayload =
      body?.verificationPayload &&
      typeof body.verificationPayload === 'object'
        ? body.verificationPayload
        : {};
    const metadata =
      body?.metadata && typeof body.metadata === 'object'
        ? body.metadata
        : {};

    if (!ALLOWED_PLACEMENTS.has(placement)) {
      return json({ ok: false, error: 'Geçersiz reklam yerleşimi.' }, 400);
    }

    if (!provider || !transactionId) {
      return json({ ok: false, error: 'Reklam doğrulama bilgisi eksik.' }, 400);
    }

    if (provider === 'admob_ssv') {
      return await pollAdMobReceipt(admin, user.id, transactionId);
    }

    let verified = false;
    let verificationMode = '';

    if (provider === 'dev_mock' || provider === 'admob_test') {
      const { data: isAdmin, error: adminError } =
        await userClient.rpc('is_admin');

      if (
        adminError ||
        isAdmin !== true ||
        verificationPayload?.test !== true
      ) {
        return json(
          {
            ok: false,
            error:
              'Test reklam ödülü yalnız admin test modunda kullanılabilir.',
          },
          409,
        );
      }

      verified = true;
      verificationMode =
        provider === 'admob_test'
          ? 'admin_admob_test'
          : 'admin_dev_mock';
    } else {
      const verifyUrl = clean(
        Deno.env.get('AD_REWARD_VERIFY_URL'),
        1000,
      );
      const verifySecret = clean(
        Deno.env.get('AD_REWARD_VERIFY_SECRET'),
        1000,
      );

      if (!verifyUrl || !verifySecret) {
        return json(
          {
            ok: false,
            error:
              'Reklam sağlayıcısının sunucu doğrulaması henüz yapılandırılmadı.',
            code: 'ad_provider_not_configured',
          },
          503,
        );
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12_000);

      try {
        const response = await fetch(verifyUrl, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${verifySecret}`,
          },
          body: JSON.stringify({
            provider,
            transactionId,
            placement,
            userId: user.id,
            verificationPayload,
          }),
        });

        const payload = await response.json().catch(() => null);
        verified = Boolean(response.ok && payload?.verified === true);
        verificationMode = clean(payload?.mode ?? provider, 80);
      } finally {
        clearTimeout(timeout);
      }
    }

    if (!verified) {
      return json(
        { ok: false, error: 'Reklam tamamlandığı doğrulanamadı.' },
        409,
      );
    }

    const { data, error } = await admin.rpc(
      'tp_award_verified_ad_reward',
      {
        p_user_id: user.id,
        p_provider: provider,
        p_provider_transaction_id: transactionId,
        p_placement: placement,
        p_metadata: {
          ...metadata,
          verification_mode: verificationMode,
        },
      },
    );

    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;

    return json({
      ok: true,
      pending: false,
      awarded: Boolean(row?.awarded),
      awardedPoints: Number(row?.awarded_points ?? 0),
      reason: String(row?.reason ?? 'unknown'),
      points: Number(row?.points ?? 0),
      lifetimePoints: Number(row?.lifetime_points ?? 0),
      dailyCount: Number(row?.daily_count ?? 0),
      dailyLimit: Number(row?.daily_limit ?? 5),
      aiCreditGranted: Boolean(row?.ai_credit_granted),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Reklam ödülü tamamlanamadı.';

    console.error('[rewarded-ad-claim]', message);
    return json({ ok: false, error: message }, 500);
  }
});
