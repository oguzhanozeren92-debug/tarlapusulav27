import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import {
  listNativePushUserIds,
  sendNativePushToUser,
} from "../_shared/nativePush.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabaseAdmin = createClient(
  supabaseUrl,
  serviceRoleKey,
  { auth: { persistSession: false } },
);

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

async function sendToUser(
  userId: string,
  payload: Record<string, unknown>,
  options: { critical?: boolean } = {},
) {
  const { data: subscriptions, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, subscription")
    .eq("user_id", userId)
    .eq("enabled", true);

  if (error) throw error;

  let webSent = 0;
  let webFailed = 0;

  for (const row of subscriptions ?? []) {
    try {
      await webpush.sendNotification(
        row.subscription,
        JSON.stringify(payload),
        {
          TTL: options.critical ? 7200 : 3600,
          urgency: options.critical ? "high" : "normal",
        },
      );
      webSent++;

      await supabaseAdmin
        .from("push_subscriptions")
        .update({
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    } catch (error: any) {
      webFailed++;
      console.error("Web Push gönderim hatası:", {
        statusCode: error?.statusCode,
        body: error?.body,
      });

      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await supabaseAdmin
          .from("push_subscriptions")
          .delete()
          .eq("id", row.id);
      }
    }
  }

  const native = await sendNativePushToUser(
    supabaseAdmin,
    userId,
    payload,
    options,
  );

  const sent = webSent + native.sent;
  const failed = webFailed + native.failed;
  const hasWeb = Boolean(subscriptions?.length);
  const hasNative = native.registered > 0;

  return {
    sent,
    failed,
    noSubscriptions: !hasWeb && !hasNative,
    webSent,
    nativeSent: native.sent,
  };
}

async function getRequestUser(req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  return error ? null : data.user;
}

async function isAuthorizedCronRequest(req: Request) {
  const supplied = req.headers.get("x-cron-secret") || "";
  if (!supplied) return false;

  const legacySecret = Deno.env.get("PUSH_CRON_SECRET") || "";
  if (legacySecret && supplied === legacySecret) return true;

  const { data, error } = await supabaseAdmin.rpc("verify_push_dispatch_secret", {
    p_secret: supplied,
  });

  if (error) {
    console.error("Push cron secret doğrulanamadı:", error.message);
    return false;
  }

  return data === true;
}

function normalizeParcelGeometry(raw: any) {
  if (!raw) return null;
  if (raw.type === "Feature" && raw.geometry) return raw;

  const geometry = raw.geometry ?? raw;
  if (!geometry || !["Polygon", "MultiPolygon"].includes(String(geometry.type))) {
    return null;
  }

  return { type: "Feature", properties: {}, geometry };
}

async function getLatestSentinel2Scene(parcelGeometry: any, daysBack: number) {
  const geometry = normalizeParcelGeometry(parcelGeometry);
  if (!geometry) return null;

  const response = await fetch(`${supabaseUrl}/functions/v1/sentinel2-latest-date`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      geometry,
      daysBack,
      maxCloudCoverage: 30,
    }),
  });

  if (!response.ok) throw new Error(`sentinel2-latest-date ${response.status}`);

  const data = await response.json();
  if (!data?.success || !data?.latestImageDate) return null;

  return {
    date: String(data.latestImageDate),
    sceneId: data.sceneId ? String(data.sceneId) : null,
    cloudCoverage: Number.isFinite(Number(data.cloudCoverage))
      ? Number(data.cloudCoverage)
      : null,
  };
}

function trDate(value: string) {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}

async function processNdviMapUpdates(force = false) {
  const { data: subscriptionRows, error: subscriptionError } = await supabaseAdmin
    .from("push_subscriptions")
    .select("user_id")
    .eq("enabled", true)
    .limit(500);

  if (subscriptionError) throw subscriptionError;

  const nativeUserIds = await listNativePushUserIds(supabaseAdmin, 500);
  const userIds = Array.from(
    new Set([
      ...(subscriptionRows ?? [])
        .map((row: any) => String(row.user_id ?? ""))
        .filter(Boolean),
      ...nativeUserIds,
    ]),
  );

  if (!userIds.length) {
    return { checked: 0, notified: 0, seeded: 0, skipped: 0, failed: 0 };
  }

  const { data: fields, error: fieldError } = await supabaseAdmin
    .from("fields")
    .select("id,user_id,name,parcel_geometry")
    .in("user_id", userIds)
    .not("parcel_geometry", "is", null)
    .limit(500);

  if (fieldError) throw fieldError;
  if (!fields?.length) {
    return { checked: 0, notified: 0, seeded: 0, skipped: 0, failed: 0 };
  }

  const fieldIds = fields.map((field: any) => String(field.id));
  const { data: stateRows, error: stateError } = await supabaseAdmin
    .from("field_satellite_notification_state")
    .select("user_id,field_id,last_scene_date,last_scene_id,last_notified_scene_date,last_checked_at")
    .in("field_id", fieldIds);

  if (stateError) throw stateError;

  const stateByField = new Map<string, any>(
    (stateRows ?? []).map((row: any) => [String(row.field_id), row]),
  );

  const now = Date.now();
  const minCheckIntervalMs = 4 * 60 * 60 * 1000;

  const eligible = fields
    .map((field: any) => {
      const state = stateByField.get(String(field.id)) ?? null;
      const lastCheckedAt = state?.last_checked_at
        ? new Date(state.last_checked_at).getTime()
        : 0;
      return { field, state, lastCheckedAt };
    })
    .filter((item: any) => {
      if (force) return true;
      if (!Number.isFinite(item.lastCheckedAt) || item.lastCheckedAt <= 0) return true;
      return now - item.lastCheckedAt >= minCheckIntervalMs;
    })
    .sort((a: any, b: any) => (a.lastCheckedAt || 0) - (b.lastCheckedAt || 0))
    .slice(0, 20);

  const skipped = Math.max(0, fields.length - eligible.length);

  async function processOne(item: any) {
    const field = item.field;
    const state = item.state;
    const fieldId = String(field.id);
    const userId = String(field.user_id);

    try {
      // İlk kurulumda eski son geçerli sahneyi baseline yap; böylece ilk gerçek yeni sahne sessizce seed edilmez.
      const daysBack = state?.last_scene_date ? 45 : 180;
      const latest = await getLatestSentinel2Scene(field.parcel_geometry, daysBack);
      const checkedAt = new Date().toISOString();

      if (!latest) {
        await supabaseAdmin
          .from("field_satellite_notification_state")
          .upsert({
            user_id: userId,
            field_id: fieldId,
            last_checked_at: checkedAt,
            last_error: null,
            updated_at: checkedAt,
          }, { onConflict: "user_id,field_id" });
        return "checked";
      }

      if (!state?.last_scene_date) {
        await supabaseAdmin
          .from("field_satellite_notification_state")
          .upsert({
            user_id: userId,
            field_id: fieldId,
            last_scene_date: latest.date,
            last_scene_id: latest.sceneId,
            last_notified_scene_date: latest.date,
            last_checked_at: checkedAt,
            last_error: null,
            updated_at: checkedAt,
          }, { onConflict: "user_id,field_id" });
        return "seeded";
      }

      const lastNotified = String(
        state.last_notified_scene_date ?? state.last_scene_date ?? "",
      );
      const isNewer = latest.date > lastNotified;

      if (!isNewer) {
        await supabaseAdmin
          .from("field_satellite_notification_state")
          .upsert({
            user_id: userId,
            field_id: fieldId,
            last_scene_date: latest.date,
            last_scene_id: latest.sceneId,
            last_checked_at: checkedAt,
            last_error: null,
            updated_at: checkedAt,
          }, { onConflict: "user_id,field_id" });
        return "checked";
      }

      const result = await sendToUser(userId, {
        title: "Yeni haritan hazır 🌿",
        body: `${String(field.name ?? "Tarlan")} için ${trDate(latest.date)} tarihli yeni NDVI haritası hazır.`,
        tag: `ndvi-${fieldId}-${latest.date}`,
        url: `/?open=ndvi&fieldId=${encodeURIComponent(fieldId)}`,
        fieldId,
        source: "satellite",
        satelliteDate: latest.date,
      });

      await supabaseAdmin
        .from("field_satellite_notification_state")
        .upsert({
          user_id: userId,
          field_id: fieldId,
          last_scene_date: latest.date,
          last_scene_id: latest.sceneId,
          last_notified_scene_date: result.sent > 0 ? latest.date : lastNotified || null,
          last_checked_at: checkedAt,
          last_error:
            result.sent > 0
              ? null
              : result.noSubscriptions
                ? "no_active_subscription"
                : "push_send_failed",
          updated_at: checkedAt,
        }, { onConflict: "user_id,field_id" });

      return result.sent > 0 ? "notified" : "failed";
    } catch (error) {
      const checkedAt = new Date().toISOString();
      console.error("NDVI push kontrolü başarısız:", fieldId, error);

      await supabaseAdmin
        .from("field_satellite_notification_state")
        .upsert({
          user_id: userId,
          field_id: fieldId,
          last_checked_at: checkedAt,
          last_error:
            error instanceof Error ? error.message.slice(0, 500) : "ndvi_check_failed",
          updated_at: checkedAt,
        }, { onConflict: "user_id,field_id" });
      return "failed";
    }
  }

  const results: string[] = [];
  const concurrency = 4;
  for (let i = 0; i < eligible.length; i += concurrency) {
    const chunk = eligible.slice(i, i + concurrency);
    results.push(...await Promise.all(chunk.map(processOne)));
  }

  return {
    checked: results.length,
    notified: results.filter((item) => item === "notified").length,
    seeded: results.filter((item) => item === "seeded").length,
    skipped,
    failed: results.filter((item) => item === "failed").length,
    forced: force,
  };
}


type SmartPushPreference = {
  push_enabled: boolean;
  critical_enabled: boolean;
  weather_enabled: boolean;
  satellite_enabled: boolean;
  field_activity_enabled: boolean;
  irrigation_enabled: boolean;
  plant_health_enabled: boolean;
  market_enabled: boolean;
  support_enabled: boolean;
  news_enabled: boolean;
  reports_enabled: boolean;
  achievement_enabled: boolean;
  reengagement_enabled: boolean;
  quiet_start: string;
  quiet_end: string;
  daily_normal_limit: number;
  timezone: string;
};

const DEFAULT_PUSH_PREFS: SmartPushPreference = {
  push_enabled: true,
  critical_enabled: true,
  weather_enabled: true,
  satellite_enabled: true,
  field_activity_enabled: true,
  irrigation_enabled: true,
  plant_health_enabled: true,
  market_enabled: true,
  support_enabled: true,
  news_enabled: true,
  reports_enabled: true,
  achievement_enabled: true,
  reengagement_enabled: true,
  quiet_start: "21:30:00",
  quiet_end: "08:00:00",
  daily_normal_limit: 3,
  timezone: "Europe/Istanbul",
};

function cleanText(value: unknown, max = 500) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function categoryEnabled(pref: SmartPushPreference, categoryInput: unknown) {
  const category = cleanText(categoryInput, 40) || "system";
  if (category === "critical") return pref.critical_enabled;
  if (category === "weather") return pref.weather_enabled;
  if (category === "satellite") return pref.satellite_enabled;
  if (category === "field_activity") return pref.field_activity_enabled;
  if (category === "irrigation") return pref.irrigation_enabled;
  if (category === "plant_health") return pref.plant_health_enabled;
  if (category === "market") return pref.market_enabled;
  if (category === "support") return pref.support_enabled;
  if (category === "news") return pref.news_enabled;
  if (category === "reports") return pref.reports_enabled;
  if (category === "achievement") return pref.achievement_enabled;
  if (category === "reengagement") return pref.reengagement_enabled;
  return true;
}

function clockMinutes(value: string) {
  const [hourRaw, minuteRaw] = String(value || "").split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;
  return Math.max(0, Math.min(1439, hour * 60 + minute));
}

function localMinutes(timezone: string, date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone || "Europe/Istanbul",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(date);
    const hour = Number(parts.find((item) => item.type === "hour")?.value ?? 0);
    const minute = Number(parts.find((item) => item.type === "minute")?.value ?? 0);
    return Math.max(0, Math.min(1439, hour * 60 + minute));
  } catch {
    return date.getUTCHours() * 60 + date.getUTCMinutes();
  }
}

function isQuietHours(pref: SmartPushPreference) {
  const start = clockMinutes(pref.quiet_start);
  const end = clockMinutes(pref.quiet_end);
  if (start === end) return false;
  const now = localMinutes(pref.timezone);
  return start < end ? now >= start && now < end : now >= start || now < end;
}

async function getPushPreference(userId: string): Promise<SmartPushPreference> {
  const { data, error } = await supabaseAdmin
    .from("user_notification_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.warn("Push tercihi okunamadı:", userId, error.message);
    return DEFAULT_PUSH_PREFS;
  }

  return {
    ...DEFAULT_PUSH_PREFS,
    ...(data || {}),
    daily_normal_limit: Number.isFinite(Number(data?.daily_normal_limit))
      ? Number(data.daily_normal_limit)
      : DEFAULT_PUSH_PREFS.daily_normal_limit,
  };
}

async function normalPushCountLast24Hours(userId: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabaseAdmin
    .from("app_notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("push_critical", false)
    .not("push_sent_at", "is", null)
    .gte("push_sent_at", since);
  if (error) return 0;
  return Number(count || 0);
}

async function releaseAppPush(
  id: string,
  patch: Record<string, unknown>,
) {
  await supabaseAdmin
    .from("app_notifications")
    .update({ push_claimed_at: null, ...patch })
    .eq("id", id);
}

async function dispatchAppNotification(job: any) {
  const userId = String(job.user_id ?? "");
  const id = String(job.id ?? "");
  if (!userId || !id) return { id, sent: 0, skipped: "invalid_job" };

  const pref = await getPushPreference(userId);
  const critical = Boolean(job.push_critical);
  const category = cleanText(job.category, 40) || "system";

  if (!pref.push_enabled) {
    await releaseAppPush(id, { push_eligible: false, push_error: "push_disabled" });
    return { id, sent: 0, skipped: "push_disabled" };
  }
  if (!categoryEnabled(pref, category)) {
    await releaseAppPush(id, { push_eligible: false, push_error: "category_disabled" });
    return { id, sent: 0, skipped: "category_disabled" };
  }
  if (critical && !pref.critical_enabled) {
    await releaseAppPush(id, { push_eligible: false, push_error: "critical_disabled" });
    return { id, sent: 0, skipped: "critical_disabled" };
  }

  if (!critical && isQuietHours(pref)) {
    await releaseAppPush(id, { push_error: "quiet_hours" });
    return { id, sent: 0, skipped: "quiet_hours" };
  }

  if (!critical) {
    const sentToday = await normalPushCountLast24Hours(userId);
    if (sentToday >= Math.max(0, pref.daily_normal_limit)) {
      await releaseAppPush(id, { push_error: "daily_limit" });
      return { id, sent: 0, skipped: "daily_limit" };
    }
  }

  const fieldId = cleanText(job.data?.fieldId ?? job.data?.field_id, 80);
  const result = await sendToUser(
    userId,
    {
      title: cleanText(job.title, 120) || "TarlaPusula",
      body: cleanText(job.message, 320) || "Pusula yeni bir gelişme fark etti.",
      tag: `app-notification-${id}`,
      url: "/",
      notificationId: id,
      fieldId: fieldId || null,
      target: cleanText(job.target, 80) || "notificationsHub",
      actionTarget: cleanText(
        job.data?.actionTarget ?? job.data?.action_target,
        120,
      ) || null,
      category,
      source: cleanText(job.source, 60) || "system",
      critical,
    },
    { critical },
  );

  if (result.sent > 0) {
    await supabaseAdmin
      .from("app_notifications")
      .update({
        push_sent_at: new Date().toISOString(),
        push_claimed_at: null,
        push_error: null,
      })
      .eq("id", id);
  } else {
    await releaseAppPush(id, {
      push_eligible: result.noSubscriptions ? false : true,
      push_error: result.noSubscriptions ? "no_active_subscription" : "push_send_failed",
    });
  }

  return { id, ...result };
}

async function processAppPushQueue(limit = 50) {
  const { data: jobs, error } = await supabaseAdmin.rpc(
    "claim_due_app_push_notifications",
    { p_limit: limit },
  );
  if (error) throw error;

  const results = [];
  for (const job of jobs ?? []) {
    results.push(await dispatchAppNotification(job));
  }

  return {
    checked: results.length,
    sent: results.filter((item: any) => Number(item.sent || 0) > 0).length,
    skipped: results.filter((item: any) => Boolean(item.skipped)).length,
    results,
  };
}

async function enqueueAuthenticatedFieldActivity(req: Request, input: any) {
  const user = await getRequestUser(req);
  if (!user) return { status: 401, body: { error: "Oturum gerekli." } };

  const category = cleanText(input?.category, 40);
  if (category !== "field_activity") {
    return { status: 400, body: { error: "Bu istemci yalnız faaliyet bildirimini kuyruğa alabilir." } };
  }

  const fieldId = cleanText(input?.data?.fieldId, 80);
  if (!fieldId) return { status: 400, body: { error: "Tarla kimliği gerekli." } };

  const { data: field, error: fieldError } = await supabaseAdmin
    .from("fields")
    .select("id,user_id,name")
    .eq("id", fieldId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (fieldError || !field) {
    return { status: 403, body: { error: "Bu tarla için bildirim oluşturamazsın." } };
  }

  const clientDedupe = cleanText(input?.dedupeKey, 220);
  const dedupeKey = `smart:${user.id}:${clientDedupe || `field-activity:${fieldId}`}`;
  const payload = {
    user_id: user.id,
    kind: "field_activity",
    source: "hybris",
    severity: "info",
    title: cleanText(input?.title, 120) || "Pusula yeni bir faaliyet fark etti",
    message: cleanText(input?.message, 500) || `${String(field.name || "Tarlan")} için yeni bir faaliyet olasılığı fark ettim.`,
    target: "home",
    data: {
      ...(input?.data && typeof input.data === "object" ? input.data : {}),
      fieldId,
      fieldName: String(field.name || "Tarlan"),
    },
    category: "field_activity",
    push_eligible: true,
    push_critical: false,
    push_available_at: new Date().toISOString(),
    dedupe_key: dedupeKey,
  };

  let notification: any = null;
  const inserted = await supabaseAdmin
    .from("app_notifications")
    .upsert(payload, { onConflict: "dedupe_key", ignoreDuplicates: true })
    .select("id,user_id,kind,source,severity,title,message,target,data,category,push_critical,push_sent_at,created_at")
    .maybeSingle();

  if (inserted.error) throw inserted.error;
  notification = inserted.data;

  if (!notification) {
    const existing = await supabaseAdmin
      .from("app_notifications")
      .select("id,user_id,kind,source,severity,title,message,target,data,category,push_critical,push_sent_at,created_at")
      .eq("dedupe_key", dedupeKey)
      .maybeSingle();
    if (existing.error) throw existing.error;
    notification = existing.data;
  }

  if (!notification) {
    return { status: 500, body: { error: "Bildirim oluşturulamadı." } };
  }

  if (notification.push_sent_at) {
    return { status: 200, body: { ok: true, deduped: true, alreadySent: true, notificationId: notification.id } };
  }

  await supabaseAdmin
    .from("app_notifications")
    .update({ push_claimed_at: new Date().toISOString(), push_attempts: 1 })
    .eq("id", notification.id)
    .is("push_sent_at", null);

  const dispatch = await dispatchAppNotification(notification);
  return {
    status: 200,
    body: {
      ok: true,
      deduped: Boolean(!inserted.data),
      notificationId: notification.id,
      dispatch,
    },
  };
}

function inactivityThreshold(days: number) {
  if (days >= 30) return 30;
  if (days >= 14) return 14;
  if (days >= 7) return 7;
  return 0;
}

async function enqueueReengagementNotifications() {
  const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: profiles, error } = await supabaseAdmin
    .from("profiles")
    .select("id,last_active_at")
    .lte("last_active_at", cutoff)
    .order("last_active_at", { ascending: true })
    .limit(120);
  if (error) throw error;

  let created = 0;
  let skipped = 0;

  for (const profile of profiles ?? []) {
    const userId = String(profile.id);
    const lastActiveAt = String(profile.last_active_at || "");
    const ageDays = lastActiveAt
      ? Math.floor((Date.now() - new Date(lastActiveAt).getTime()) / 86_400_000)
      : 0;
    const threshold = inactivityThreshold(ageDays);
    if (!threshold) continue;

    const pref = await getPushPreference(userId);
    if (!pref.push_enabled || !pref.reengagement_enabled) {
      skipped++;
      continue;
    }

    const { data: unread, error: unreadError } = await supabaseAdmin
      .from("app_notifications")
      .select("id")
      .eq("user_id", userId)
      .eq("is_read", false)
      .neq("kind", "task")
      .gt("created_at", lastActiveAt)
      .limit(1);
    if (unreadError || !unread?.length) {
      skipped++;
      continue;
    }

    const cycle = lastActiveAt.slice(0, 10) || "unknown";
    const dedupeKey = `reengagement:${userId}:${cycle}:${threshold}`;
    const title =
      threshold >= 30
        ? "Pusula senin için son durumu özetledi"
        : threshold >= 14
          ? "Son girişinden beri yeni gelişmeler var"
          : "Tarlalarında yeni veriler birikti";
    const message =
      threshold >= 30
        ? "Uzun süredir uğramadın. Son girişinden beri biriken önemli tarla gelişmelerini tek yerde görebilirsin."
        : "Son girişinden beri tarlalarınla ilgili yeni gelişmeler oluştu. Pusula önemli olanları senin için ayırdı.";

    const inserted = await supabaseAdmin
      .from("app_notifications")
      .upsert({
        user_id: userId,
        kind: "reengagement",
        source: "pusula",
        severity: "info",
        title,
        message,
        target: "notificationsHub",
        data: { inactiveDays: ageDays, threshold, lastActiveAt },
        category: "reengagement",
        push_eligible: true,
        push_critical: false,
        push_available_at: new Date().toISOString(),
        dedupe_key: dedupeKey,
      }, { onConflict: "dedupe_key", ignoreDuplicates: true })
      .select("id")
      .maybeSingle();

    if (inserted.error) {
      console.warn("Pasif kullanıcı bildirimi oluşturulamadı:", userId, inserted.error.message);
      skipped++;
      continue;
    }
    if (inserted.data?.id) created++;
    else skipped++;
  }

  return { created, skipped };
}


function isoDayShift(day: string, delta: number) {
  const date = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return day;
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function eventAgeDays(day: string) {
  const date = new Date(`${day}T12:00:00Z`).getTime();
  if (!Number.isFinite(date)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((Date.now() - date) / 86_400_000));
}

function activityTypesForEvent(type: string) {
  if (type === "sowing") return ["Ekim / Dikim"];
  if (type === "harvest") return ["Hasat"];
  return ["Sürme", "İkileme", "Çapalama"];
}

function activityLabelForEvent(type: string) {
  if (type === "sowing") return "ekim / dikim";
  if (type === "harvest") return "hasat";
  return "toprak işleme";
}

async function processFieldActivityUpdates(cronSecret: string, force = false) {
  const { data: subscriptionRows, error: subscriptionError } = await supabaseAdmin
    .from("push_subscriptions")
    .select("user_id")
    .eq("enabled", true)
    .limit(500);
  if (subscriptionError) throw subscriptionError;

  const nativeUserIds = await listNativePushUserIds(supabaseAdmin, 500);
  const userIds = Array.from(
    new Set([
      ...(subscriptionRows ?? [])
        .map((row: any) => String(row.user_id ?? ""))
        .filter(Boolean),
      ...nativeUserIds,
    ]),
  );
  if (!userIds.length) {
    return { checked: 0, seeded: 0, queued: 0, covered: 0, skipped: 0, failed: 0 };
  }

  const { data: fields, error: fieldError } = await supabaseAdmin
    .from("fields")
    .select("id,user_id,name,parcel_geometry")
    .in("user_id", userIds)
    .not("parcel_geometry", "is", null)
    .limit(300);
  if (fieldError) throw fieldError;
  if (!fields?.length) {
    return { checked: 0, seeded: 0, queued: 0, covered: 0, skipped: 0, failed: 0 };
  }

  const fieldIds = fields.map((field: any) => String(field.id));
  const { data: states, error: stateError } = await supabaseAdmin
    .from("field_activity_notification_state")
    .select("field_id,user_id,last_checked_at,last_candidate_key,last_notified_candidate_key,last_error")
    .in("field_id", fieldIds);
  if (stateError) throw stateError;

  const stateByField = new Map(
    (states ?? []).map((row: any) => [String(row.field_id), row]),
  );
  const minInterval = 20 * 60 * 60 * 1000;
  const now = Date.now();

  const eligible = fields
    .map((field: any) => {
      const state = stateByField.get(String(field.id)) ?? null;
      const lastChecked = state?.last_checked_at
        ? new Date(state.last_checked_at).getTime()
        : 0;
      return { field, state, lastChecked };
    })
    .filter((item: any) => {
      if (force) return true;
      if (!item.lastChecked || !Number.isFinite(item.lastChecked)) return true;
      return now - item.lastChecked >= minInterval;
    })
    .sort((a: any, b: any) => (a.lastChecked || 0) - (b.lastChecked || 0))
    .slice(0, force ? 20 : 4);

  const stats = { checked: 0, seeded: 0, queued: 0, covered: 0, skipped: Math.max(0, fields.length - eligible.length), failed: 0 };

  for (const item of eligible) {
    const field = item.field;
    const fieldId = String(field.id);
    const userId = String(field.user_id);
    const checkedAt = new Date().toISOString();
    stats.checked++;

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/hybris-field-events`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
          "Content-Type": "application/json",
          "x-cron-secret": cronSecret,
        },
        body: JSON.stringify({ field_id: fieldId, user_id: userId }),
        signal: AbortSignal.timeout(70_000),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(
          `hybris-field-events ${response.status}: ${String(payload?.error ?? "boş yanıt").slice(0, 280)}`,
        );
      }

      const events = Array.isArray(payload.events) ? payload.events : [];
      const candidate = events
        .filter((event: any) =>
          event?.confidence === "medium" &&
          event?.signal_date &&
          eventAgeDays(String(event.signal_date)) <= 60
        )
        .sort((a: any, b: any) => String(b.signal_date).localeCompare(String(a.signal_date)))[0] ?? null;

      if (!candidate) {
        await supabaseAdmin
          .from("field_activity_notification_state")
          .upsert({
            field_id: fieldId,
            user_id: userId,
            last_checked_at: checkedAt,
            last_error: null,
            updated_at: checkedAt,
          }, { onConflict: "field_id" });
        continue;
      }

      const candidateKey = `hybris:${String(candidate.type)}:${String(candidate.signal_date)}`;

      // İlk arka plan taramasında geçmişteki mevcut adayları kullanıcıya
      // "yeni" diye göndermeyiz. O anki son aday baseline olur; ancak bundan
      // sonra candidateKey değişirse gerçek yeni faaliyet bildirimi üretilir.
      if (!item.state) {
        stats.seeded++;
        await supabaseAdmin
          .from("field_activity_notification_state")
          .upsert({
            field_id: fieldId,
            user_id: userId,
            last_checked_at: checkedAt,
            last_candidate_key: candidateKey,
            last_notified_candidate_key: null,
            last_error: null,
            updated_at: checkedAt,
          }, { onConflict: "field_id" });
        continue;
      }

      if (String(item.state?.last_candidate_key ?? "") === candidateKey) {
        await supabaseAdmin
          .from("field_activity_notification_state")
          .upsert({
            field_id: fieldId,
            user_id: userId,
            last_checked_at: checkedAt,
            last_error: null,
            updated_at: checkedAt,
          }, { onConflict: "field_id" });
        continue;
      }

      const { data: feedback } = await supabaseAdmin
        .from("field_event_candidate_feedback")
        .select("status")
        .eq("field_id", fieldId)
        .eq("candidate_key", candidateKey)
        .maybeSingle();

      if (feedback && ["confirmed", "dismissed", "covered"].includes(String(feedback.status))) {
        stats.covered++;
        await supabaseAdmin
          .from("field_activity_notification_state")
          .upsert({
            field_id: fieldId,
            user_id: userId,
            last_checked_at: checkedAt,
            last_candidate_key: candidateKey,
            last_error: null,
            updated_at: checkedAt,
          }, { onConflict: "field_id" });
        continue;
      }

      const uncertainty = Math.min(28, Math.max(7, Number(candidate.uncertainty_days ?? 28)));
      const signalDate = String(candidate.signal_date);
      const allowedTypes = activityTypesForEvent(String(candidate.type));
      const { data: matchingActivities, error: activityError } = await supabaseAdmin
        .from("activities")
        .select("id")
        .eq("user_id", userId)
        .eq("field_id", fieldId)
        .in("activity_type", allowedTypes)
        .gte("activity_date", isoDayShift(signalDate, -uncertainty))
        .lte("activity_date", isoDayShift(signalDate, uncertainty))
        .limit(1);
      if (activityError) throw activityError;

      if (matchingActivities?.length) {
        stats.covered++;
        await supabaseAdmin
          .from("field_activity_notification_state")
          .upsert({
            field_id: fieldId,
            user_id: userId,
            last_checked_at: checkedAt,
            last_candidate_key: candidateKey,
            last_error: null,
            updated_at: checkedAt,
          }, { onConflict: "field_id" });
        continue;
      }

      const fieldName = String(field.name || "Tarlan");
      const label = activityLabelForEvent(String(candidate.type));
      const dedupeKey = `smart:${userId}:field-activity:${userId}:${fieldId}:${candidateKey}`;

      const inserted = await supabaseAdmin
        .from("app_notifications")
        .upsert({
          user_id: userId,
          kind: "field_activity",
          source: "hybris",
          severity: "info",
          title: "Pusula yeni bir faaliyet fark etti",
          message: `${fieldName} tarlasında ${label} ile uyumlu yeni bir değişim olasılığı fark ettim. Ne yaptığını doğrularsan tarla kayıtlarını güncelleyebilirim.`,
          target: "home",
          data: {
            fieldId,
            fieldName,
            candidateKey,
            eventType: String(candidate.type),
            signalDate,
            uncertaintyDays: uncertainty,
            confidence: "medium",
            prominence: Number(candidate.prominence ?? 0),
            actionTarget: "field-activity",
          },
          category: "field_activity",
          push_eligible: true,
          push_critical: false,
          push_available_at: checkedAt,
          dedupe_key: dedupeKey,
        }, { onConflict: "dedupe_key", ignoreDuplicates: true })
        .select("id")
        .maybeSingle();

      if (inserted.error) throw inserted.error;
      if (inserted.data?.id) stats.queued++;

      await supabaseAdmin
        .from("field_activity_notification_state")
        .upsert({
          field_id: fieldId,
          user_id: userId,
          last_checked_at: checkedAt,
          last_candidate_key: candidateKey,
          last_notified_candidate_key: candidateKey,
          last_error: null,
          updated_at: checkedAt,
        }, { onConflict: "field_id" });
    } catch (error) {
      stats.failed++;
      console.error("Faaliyet push taraması başarısız:", fieldId, error);
      await supabaseAdmin
        .from("field_activity_notification_state")
        .upsert({
          field_id: fieldId,
          user_id: userId,
          last_checked_at: checkedAt,
          last_error: error instanceof Error ? error.message.slice(0, 500) : "field_activity_scan_failed",
          updated_at: checkedAt,
        }, { onConflict: "field_id" });
    }
  }

  return stats;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));

    if (body?.enqueuePush) {
      const queued = await enqueueAuthenticatedFieldActivity(req, body.enqueuePush);
      return new Response(JSON.stringify(queued.body), {
        status: queued.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body?.notificationId) {
      const user = await getRequestUser(req);
      if (!user) {
        return new Response(JSON.stringify({ error: "Oturum gerekli." }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: notification, error: notificationError } = await supabaseAdmin
        .from("app_notifications")
        .select("id,user_id,kind,source,severity,title,message,target,data,category,push_critical,push_sent_at,created_at")
        .eq("id", String(body.notificationId))
        .eq("user_id", user.id)
        .maybeSingle();
      if (notificationError) throw notificationError;
      if (!notification) {
        return new Response(JSON.stringify({ error: "Bildirim bulunamadı." }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (notification.push_sent_at) {
        return new Response(JSON.stringify({ ok: true, alreadySent: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabaseAdmin
        .from("app_notifications")
        .update({ push_claimed_at: new Date().toISOString() })
        .eq("id", notification.id);

      const dispatch = await dispatchAppNotification(notification);
      return new Response(JSON.stringify({ ok: Number(dispatch.sent || 0) > 0, dispatch }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body?.test === true) {
      const user = await getRequestUser(req);
      if (!user) {
        return new Response(JSON.stringify({ error: "Oturum gerekli." }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const result = await sendToUser(user.id, {
        title: "TarlaPusula test bildirimi",
        body: "Telefon bildirimi başarıyla çalışıyor.",
        tag: "tarlapusula-test",
        url: "/",
      });

      return new Response(
        JSON.stringify({
          ok: result.sent > 0,
          ...result,
          error: result.sent > 0 ? null : "Aktif push aboneliği bulunamadı.",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!(await isAuthorizedCronRequest(req))) {
      return new Response(JSON.stringify({ error: "Unauthorized cron request." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cronSecret = req.headers.get("x-cron-secret") || "";

    if (body?.ndviOnly === true) {
      const ndvi = await processNdviMapUpdates(body?.force === true);
      const appPush = await processAppPushQueue(50);
      return new Response(JSON.stringify({ ok: true, processedReminders: 0, ndvi, appPush }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: jobs, error: jobsError } = await supabaseAdmin.rpc(
      "claim_due_push_reminders",
      { p_limit: 50 },
    );
    if (jobsError) throw jobsError;

    const reminderResults = [];
    for (const job of jobs ?? []) {
      const timeText = job.reminder_time ? String(job.reminder_time).slice(0, 5) : "";
      const result = await sendToUser(job.user_id, {
        title: `TarlaPusula • ${job.reminder_type}`,
        body: `${job.field_name}: ${job.title}${timeText ? ` • ${timeText}` : ""}`,
        tag: `reminder-${job.id}`,
        reminderId: job.id,
        url: "/",
      });

      if (result.sent > 0) {
        await supabaseAdmin
          .from("calendar_reminders")
          .update({ push_sent_at: new Date().toISOString(), push_claimed_at: null, push_error: null })
          .eq("id", job.id);
      } else {
        await supabaseAdmin
          .from("calendar_reminders")
          .update({
            push_claimed_at: null,
            push_error: result.noSubscriptions ? "no_active_subscription" : "push_send_failed",
          })
          .eq("id", job.id);
      }

      reminderResults.push({ reminderId: job.id, ...result });
    }

    const reengagement = await enqueueReengagementNotifications();
    const fieldActivity = await processFieldActivityUpdates(cronSecret, body?.forceFieldActivity === true);
    const appPush = await processAppPushQueue(50);
    const ndvi = await processNdviMapUpdates(false);

    return new Response(
      JSON.stringify({
        ok: true,
        processedReminders: reminderResults.length,
        reminderResults,
        reengagement,
        fieldActivity,
        appPush,
        ndvi,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("send-due-reminders error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Push gönderiminde hata oluştu.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});