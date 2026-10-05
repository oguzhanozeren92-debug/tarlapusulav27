import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@tarlapusula.app";
const pushReady = Boolean(vapidPublic && vapidPrivate);
if (pushReady) webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function requireAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: json({ ok: false, error: "Oturum gerekli." }, 401) };

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData.user;
  if (userError || !user) return { error: json({ ok: false, error: "Geçersiz oturum." }, 401) };

  const { data: membership, error: membershipError } = await admin
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError || !membership?.user_id) {
    return { error: json({ ok: false, error: "Admin yetkisi gerekli." }, 403) };
  }
  return { user };
}

async function audit(adminUserId: string, action: string, targetType?: string, targetId?: string, payload: Record<string, unknown> = {}) {
  await admin.from("admin_audit_log").insert({
    admin_user_id: adminUserId,
    action,
    target_type: targetType ?? null,
    target_id: targetId ?? null,
    payload,
  });
}

async function allAuthUsers() {
  const users: any[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    users.push(...(data.users ?? []));
    if ((data.users ?? []).length < 100) break;
  }
  return users;
}

async function buildUsers() {
  const [authUsers, profileResult, fieldResult, pushResult, gamificationResult] = await Promise.all([
    allAuthUsers(),
    admin.from("profiles").select("id,username,full_name,onboarding_completed,subscription_plan,role,created_at,updated_at"),
    admin.from("fields").select("id,user_id,name,city,district,village,area_decare,crop,status,created_at,updated_at"),
    admin.from("push_subscriptions").select("user_id,enabled,last_seen_at"),
    admin.from("user_gamification").select("user_id,points,lifetime_points,updated_at"),
  ]);

  for (const result of [profileResult, fieldResult, pushResult, gamificationResult]) {
    if (result.error) throw result.error;
  }

  const profiles = new Map((profileResult.data ?? []).map((p: any) => [String(p.id), p]));
  const gamification = new Map((gamificationResult.data ?? []).map((g: any) => [String(g.user_id), g]));
  const fieldsByUser = new Map<string, any[]>();
  for (const field of fieldResult.data ?? []) {
    const key = String((field as any).user_id ?? "");
    const rows = fieldsByUser.get(key) ?? [];
    rows.push(field);
    fieldsByUser.set(key, rows);
  }
  const pushByUser = new Map<string, any[]>();
  for (const sub of pushResult.data ?? []) {
    const key = String((sub as any).user_id ?? "");
    const rows = pushByUser.get(key) ?? [];
    rows.push(sub);
    pushByUser.set(key, rows);
  }

  return authUsers.map((u: any) => {
    const profile: any = profiles.get(String(u.id)) ?? null;
    const score: any = gamification.get(String(u.id)) ?? null;
    const fields = fieldsByUser.get(String(u.id)) ?? [];
    const pushes = pushByUser.get(String(u.id)) ?? [];
    return {
      id: u.id,
      email: u.email ?? null,
      phone: u.phone ?? null,
      created_at: u.created_at ?? null,
      last_sign_in_at: u.last_sign_in_at ?? null,
      email_confirmed_at: u.email_confirmed_at ?? null,
      full_name: profile?.full_name ?? null,
      username: profile?.username ?? null,
      onboarding_completed: Boolean(profile?.onboarding_completed),
      subscription_plan: profile?.subscription_plan ?? "free",
      role: profile?.role ?? "user",
      field_count: fields.length,
      total_decare: fields.reduce((sum: number, f: any) => sum + (Number(f.area_decare) || 0), 0),
      crops: Array.from(new Set(fields.map((f: any) => String(f.crop ?? "").trim()).filter(Boolean))),
      points: Number(score?.points ?? 0),
      lifetime_points: Number(score?.lifetime_points ?? 0),
      active_push_count: pushes.filter((p: any) => p.enabled).length,
      latest_push_seen_at: pushes.map((p: any) => p.last_seen_at).filter(Boolean).sort().reverse()[0] ?? null,
    };
  });
}

async function sendPushToUser(userId: string, payload: Record<string, unknown>) {
  if (!pushReady) return { sent: 0, failed: 0, unavailable: true };
  const { data: subscriptions, error } = await admin
    .from("push_subscriptions")
    .select("id,subscription")
    .eq("user_id", userId)
    .eq("enabled", true);
  if (error) throw error;
  let sent = 0;
  let failed = 0;
  for (const row of subscriptions ?? []) {
    try {
      await webpush.sendNotification((row as any).subscription, JSON.stringify(payload), { TTL: 3600, urgency: "normal" });
      sent++;
    } catch (error: any) {
      failed++;
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await admin.from("push_subscriptions").delete().eq("id", (row as any).id);
      }
    }
  }
  return { sent, failed, unavailable: false };
}

function isRecent(value: string | null | undefined, days: number) {
  if (!value) return false;
  const t = new Date(value).getTime();
  return Number.isFinite(t) && Date.now() - t <= days * 86400000;
}


type HealthRow = { id: string; title: string; status: string; detail: string; at: string | null; url?: string };
type HealthCard = { id: string; title: string; status: "connected" | "missing" | "error"; message: string; rows: HealthRow[]; url: string };

const healthClean = (value: unknown, max = 240) => String(value ?? "").replace(/\s+/g, " ").slice(0, max);
const healthDate = (value: unknown) => {
  const time = Date.parse(String(value ?? ""));
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
};
const healthSafeText = (value: unknown) => healthClean(value)
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[e-posta]")
  .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, "[token]")
  .replace(/https?:\/\/[^\s]+/g, "[adres]");

async function collectSystemHealth(): Promise<HealthCard[]> {
  async function get(url: string, headers: Record<string, string>) {
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(8000), redirect: "error" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }
  async function card(
    id: string,
    title: string,
    url: string,
    configured: boolean,
    read: () => Promise<{ message: string; rows: HealthRow[] }>,
  ): Promise<HealthCard> {
    if (!configured) return { id, title, url, status: "missing", message: "Panel bağlantısı kurulmadı.", rows: [] };
    try {
      const result = await read();
      const allFailed = id === "apify" && result.rows.length > 0 && result.rows.every((row) => row.status === "Durum alınamadı");
      return { id, title, url, status: allFailed ? "error" : "connected", ...result };
    } catch (error) {
      const reason = error instanceof Error && /^HTTP \d{3}$/.test(error.message) ? error.message : "Bağlantı veya yanıt hatası";
      return { id, title, url, status: "error", message: reason + ". Durum doğrulanamadı; erişim yetkisini ve servis ayarlarını kontrol edin.", rows: [] };
    }
  }

  const sourceNames: Record<string, string> = {};
  let parsedTaskMap: Record<string, string> | null = null;
  try {
    const raw = JSON.parse(Deno.env.get("APIFY_SOURCE_TASKS") || "{}");
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      parsedTaskMap = raw;
      const ids = Object.keys(raw).slice(0, 10);
      if (ids.length) {
        const { data } = await admin.from("content_sources").select("id,name").in("id", ids);
        for (const source of data || []) sourceNames[String(source.id)] = String(source.name || "");
      }
    }
  } catch {}

  const org = Deno.env.get("SENTRY_ORG")?.trim();
  const project = Deno.env.get("SENTRY_PROJECT")?.trim();
  const sentryToken = Deno.env.get("SENTRY_READ_TOKEN")?.trim();
  const sentryRegion = Deno.env.get("SENTRY_REGION");
  const sentryHost = sentryRegion === "eu" ? "https://de.sentry.io" : sentryRegion === "us" ? "https://us.sentry.io" : "https://sentry.io";
  const apifyToken = Deno.env.get("APIFY_TOKEN")?.trim();
  const taskMapText = Deno.env.get("APIFY_SOURCE_TASKS")?.trim();

  return Promise.all([
    card("sentry", "Uygulama hataları", "https://sentry.io/", Boolean(org && project && sentryToken), async () => {
      const query = new URLSearchParams({ project: project!, query: "is:unresolved issue.category:error", statsPeriod: "14d", sort: "date", limit: "20" });
      const data = await get(sentryHost + "/api/0/organizations/" + encodeURIComponent(org!) + "/issues/?" + query, { Authorization: "Bearer " + sentryToken });
      if (!Array.isArray(data)) throw new Error("Invalid response");
      return {
        message: "Son 14 günde görülen, çözülmemiş en fazla 20 hata. Kayıt yoksa tüm uygulamanın hatasız olduğu anlamına gelmez.",
        rows: data.slice(0, 20).map((item: any) => {
          const id = healthClean(item.id, 80);
          return {
            id,
            title: healthSafeText(item.title) || "Uygulama hatası",
            status: "Açık hata",
            detail: Math.max(0, Number(item.count) || 0) + " tekrar · " + healthSafeText(item.culprit),
            at: healthDate(item.lastSeen),
            url: "https://sentry.io/organizations/" + encodeURIComponent(org!) + "/issues/" + encodeURIComponent(id) + "/",
          };
        }),
      };
    }),
    card("healthchecks", "Otomasyon takibi", "", true, async () => {
      const { data, error } = await admin.rpc("admin_cron_health");
      if (error) throw error;
      const jobs = Array.isArray(data) ? data : [];
      const labels: Record<string, string> = {
        "tarlapusula-push-dispatch": "Bildirim dağıtımı",
        "tarlapusula-content-asset-queue": "İçerik görsel kuyruğu",
        "tarlapusula-news-fallback": "Haber yedek taraması",
        "tarlapusula-content-harvest-hourly": "İçerik toplama",
        "tarlapusula-knowledge-harvest": "Bilgi Rehberi taraması",
        "tarlapusula-research-harvest": "Makale taraması",
        "tarlapusula-guide-reconcile": "Bilgi Rehberi eşitleme",
      };
      return {
        message: "TarlaPusula zamanlanmış işlerinin Supabase'deki gerçek son çalışma durumu. Harici izleme hesabı gerekmez.",
        rows: jobs.slice(0, 20).map((item: any) => {
          const raw = String(item.status || "").toLowerCase();
          const status = !item.active ? "Duraklatıldı" : raw === "succeeded" ? "Çalışıyor" : raw === "failed" ? "Başarısız" : raw === "running" ? "Çalışıyor" : raw ? healthSafeText(raw) : "İlk çalışma bekleniyor";
          const detail = "Plan: " + healthClean(item.schedule, 80) + (item.return_message ? " · " + healthSafeText(item.return_message) : "");
          return {
            id: String(item.job_id),
            title: labels[String(item.job_name)] || healthSafeText(item.job_name) || "Zamanlanmış işlem",
            status,
            detail,
            at: healthDate(item.end_time || item.start_time),
          };
        }),
      };
    }),
    card("apify", "İçerik toplama", "https://console.apify.com/actors/tasks", Boolean(apifyToken && taskMapText && parsedTaskMap), async () => {
      const entries = Object.entries(parsedTaskMap || {});
      if (entries.some(([, task]) => typeof task !== "string" || !/^[\w~-]{1,160}$/.test(task))) throw new Error("Invalid task");
      const rows: HealthRow[] = [];
      const states: Record<string, string> = { SUCCEEDED: "Tamamlandı", FAILED: "Başarısız", RUNNING: "Çalışıyor", READY: "Sırada", ABORTED: "Durduruldu", "TIMED-OUT": "Süre doldu", "TIMING-OUT": "Süresi doluyor", ABORTING: "Durduruluyor" };
      const maxAgeRaw = Number(Deno.env.get("APIFY_MAX_AGE_HOURS") || 48);
      const maxAge = Number.isFinite(maxAgeRaw) ? Math.max(1, Math.min(maxAgeRaw, 168)) : 48;
      const selected = entries.slice(0, 10);
      for (let start = 0; start < selected.length; start += 2) {
        rows.push(...await Promise.all(selected.slice(start, start + 2).map(async ([sourceId, task]): Promise<HealthRow> => {
          try {
            const result = await get("https://api.apify.com/v2/actor-tasks/" + encodeURIComponent(String(task)) + "/runs/last", { Authorization: "Bearer " + apifyToken });
            const data = result?.data;
            if (!data?.status) throw new Error("Invalid run");
            const at = healthDate(data.finishedAt ?? data.startedAt);
            const stale = data.status === "SUCCEEDED" && (!at || Date.now() - Date.parse(at) > maxAge * 3600000);
            return {
              id: sourceId,
              title: healthSafeText(sourceNames[sourceId]) || "İçerik kaynağı",
              status: stale ? "Sonuç eski" : states[data.status] || "Bilinmiyor",
              detail: "Görev: " + healthClean(task, 160),
              at,
            };
          } catch {
            return { id: sourceId, title: healthSafeText(sourceNames[sourceId]) || "İçerik kaynağı", status: "Durum alınamadı", detail: "Görev erişimini ve son çalışmasını kontrol edin.", at: null };
          }
        })));
      }
      return { message: entries.length + " eşlenmiş görevden ilk " + rows.length + " gösteriliyor. Bu ekran tarama başlatmaz.", rows };
    }),
  ]);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "POST gerekli." }, 405);

  const guard = await requireAdmin(req);
  if (guard.error) return guard.error;
  const adminUser = guard.user!;

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "overview");

    if (action === "system_health") {
      const cards = await collectSystemHealth();
      return new Response(JSON.stringify({ ok: true, checkedAt: new Date().toISOString(), cards }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }

    if (action === "overview" || action === "list_users") {
      const users = await buildUsers();
      const [candidateCount, publishedCount, sourceCount, notificationCount] = await Promise.all([
        admin.from("content_candidates").select("id", { count: "exact", head: true }).eq("status", "pending_review"),
        admin.from("content_items").select("id", { count: "exact", head: true }).eq("status", "published"),
        admin.from("content_sources").select("id", { count: "exact", head: true }).eq("is_active", true),
        admin.from("app_notifications").select("id", { count: "exact", head: true }),
      ]);
      return json({
        ok: true,
        metrics: {
          users: users.length,
          active_7d: users.filter((u: any) => isRecent(u.last_sign_in_at, 7)).length,
          active_30d: users.filter((u: any) => isRecent(u.last_sign_in_at, 30)).length,
          fields: users.reduce((n: number, u: any) => n + u.field_count, 0),
          total_decare: users.reduce((n: number, u: any) => n + u.total_decare, 0),
          active_push_users: users.filter((u: any) => u.active_push_count > 0).length,
          pending_content: candidateCount.count ?? 0,
          published_content: publishedCount.count ?? 0,
          active_sources: sourceCount.count ?? 0,
          notifications: notificationCount.count ?? 0,
        },
        users,
      });
    }

    if (action === "user_detail") {
      const userId = String(body?.user_id ?? "");
      if (!userId) return json({ ok: false, error: "user_id gerekli." }, 400);
      const [authUser, profile, fields, activities, todos, notes, expenses, analyses, reminders, notifications, gamification] = await Promise.all([
        admin.auth.admin.getUserById(userId),
        admin.from("profiles").select("*").eq("id", userId).maybeSingle(),
        admin.from("fields").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
        admin.from("activities").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(80),
        admin.from("field_todos").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(80),
        admin.from("field_notes").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
        admin.from("activity_expenses").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(80),
        admin.from("field_ai_analyses").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(40),
        admin.from("calendar_reminders").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
        admin.from("app_notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(80),
        admin.from("user_gamification").select("*").eq("user_id", userId).maybeSingle(),
      ]);
      return json({
        ok: true,
        user: authUser.data?.user ? {
          id: authUser.data.user.id,
          email: authUser.data.user.email,
          phone: authUser.data.user.phone,
          created_at: authUser.data.user.created_at,
          last_sign_in_at: authUser.data.user.last_sign_in_at,
        } : null,
        profile: profile.data ?? null,
        fields: fields.data ?? [],
        activities: activities.data ?? [],
        todos: todos.data ?? [],
        notes: notes.data ?? [],
        expenses: expenses.data ?? [],
        analyses: analyses.data ?? [],
        reminders: reminders.data ?? [],
        notifications: notifications.data ?? [],
        gamification: gamification.data ?? null,
      });
    }

    if (action === "audit_list") {
      const limit = Math.max(1, Math.min(Number(body?.limit ?? 80), 250));
      const { data, error } = await admin
        .from("admin_audit_log")
        .select("id,admin_user_id,action,target_type,target_id,payload,created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return json({ ok: true, rows: data ?? [] });
    }

    if (action === "list_ui_overrides") {
      const { data, error } = await admin.from("admin_ui_overrides").select("*").order("updated_at", { ascending: false });
      if (error) throw error;
      return json({ ok: true, rows: data ?? [] });
    }

    if (action === "save_ui_override") {
      const selector = String(body?.selector ?? "").trim();
      if (!selector || selector.length > 1000) return json({ ok: false, error: "Geçerli selector gerekli." }, 400);
      const row = {
        selector,
        label: body?.label ? String(body.label).slice(0, 200) : null,
        text_value: body?.text_value === null || body?.text_value === undefined ? null : String(body.text_value).slice(0, 5000),
        image_src: body?.image_src ? String(body.image_src).slice(0, 3000) : null,
        hidden: Boolean(body?.hidden),
        style: body?.style && typeof body.style === "object" ? body.style : {},
        parent_selector: body?.parent_selector ? String(body.parent_selector).slice(0, 1000) : null,
        position_index: Number.isInteger(body?.position_index) ? Number(body.position_index) : null,
        enabled: body?.enabled !== false,
        updated_by: adminUser.id,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await admin
        .from("admin_ui_overrides")
        .upsert({ ...row, created_by: adminUser.id }, { onConflict: "selector" })
        .select("*")
        .single();
      if (error) throw error;
      await audit(adminUser.id, "ui_override_save", "ui_element", selector, { label: row.label });
      return json({ ok: true, row: data });
    }

    if (action === "delete_ui_override") {
      const selector = String(body?.selector ?? "").trim();
      if (!selector) return json({ ok: false, error: "selector gerekli." }, 400);
      const { error } = await admin.from("admin_ui_overrides").delete().eq("selector", selector);
      if (error) throw error;
      await audit(adminUser.id, "ui_override_delete", "ui_element", selector);
      return json({ ok: true });
    }

    if (action === "broadcast") {
      const title = String(body?.title ?? "").trim();
      const message = String(body?.message ?? "").trim();
      const target = String(body?.target ?? "notificationsHub").trim() || "notificationsHub";
      const severity = ["info", "warning", "critical"].includes(String(body?.severity)) ? String(body.severity) : "info";
      if (!title || !message) return json({ ok: false, error: "Başlık ve mesaj gerekli." }, 400);

      const allUsers = await buildUsers();
      const audience = ["all", "plan", "crop", "selected"].includes(String(body?.audience)) ? String(body.audience) : "all";
      const selectedIds = new Set(Array.isArray(body?.user_ids) ? body.user_ids.map(String) : []);
      const plan = String(body?.plan ?? "").trim().toLowerCase();
      const crop = String(body?.crop ?? "").trim().toLocaleLowerCase("tr-TR");
      let recipients = allUsers;
      if (audience === "selected") recipients = allUsers.filter((u: any) => selectedIds.has(String(u.id)));
      if (audience === "plan") recipients = allUsers.filter((u: any) => String(u.subscription_plan ?? "free").toLowerCase() === plan);
      if (audience === "crop") recipients = allUsers.filter((u: any) => (u.crops ?? []).some((x: string) => String(x).toLocaleLowerCase("tr-TR").includes(crop)));

      const stamp = Date.now();
      const rows = recipients.map((u: any) => ({
        user_id: u.id,
        kind: "notification",
        source: "admin_broadcast",
        severity,
        title,
        message,
        target,
        data: { admin_broadcast: true, audience },
        dedupe_key: `admin:broadcast:${stamp}:${u.id}`,
        is_read: false,
      }));
      if (rows.length) {
        const { error } = await admin.from("app_notifications").insert(rows);
        if (error) throw error;
      }

      let pushSent = 0;
      let pushFailed = 0;
      for (const u of recipients) {
        const result = await sendPushToUser(String(u.id), {
          title,
          body: message,
          tag: `admin-broadcast-${stamp}`,
          url: target === "home" ? "/" : `/?open=${encodeURIComponent(target)}`,
          source: "admin_broadcast",
        });
        pushSent += result.sent;
        pushFailed += result.failed;
      }
      await audit(adminUser.id, "broadcast_notification", "users", audience, {
        recipient_count: recipients.length,
        title,
        target,
        severity,
        audience,
        plan: audience === "plan" ? plan : null,
        crop: audience === "crop" ? crop : null,
        push_sent: pushSent,
        push_failed: pushFailed,
      });
      return json({ ok: true, recipients: recipients.length, push_sent: pushSent, push_failed: pushFailed, push_available: pushReady });
    }

    return json({ ok: false, error: "Bilinmeyen action." }, 400);
  } catch (error) {
    console.error("admin-control-center", error);
    return json({ ok: false, error: error instanceof Error ? error.message : "Admin işlemi başarısız." }, 500);
  }
});