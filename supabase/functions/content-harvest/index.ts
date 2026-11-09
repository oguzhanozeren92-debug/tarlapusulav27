import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
});

async function authorize(req: Request, admin: any) {
  const cron = req.headers.get("x-cron-token")?.trim() ?? "";
  if (cron) {
    const check = await admin.rpc("content_engine_check_cron_token", { p_token: cron });
    if (!check.error && check.data === true) return { ok: true, mode: "cron", cron };
  }

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, mode: "", cron: "" };
  const auth = await admin.auth.getUser(token);
  if (auth.error || !auth.data.user) return { ok: false, mode: "", cron: "" };
  const member = await admin.from("admin_users").select("user_id").eq("user_id", auth.data.user.id).maybeSingle();
  return { ok: Boolean(member.data), mode: member.data ? "admin" : "", cron: "" };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Sadece POST." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return json({ error: "Sunucu yapılandırması eksik." }, 500);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const access = await authorize(req, admin);
  if (!access.ok) return json({ error: "Admin veya cron yetkisi gerekli." }, 403);

  const raw = await req.text();
  let body: Record<string, any> = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
  if (body.limit && !body.maxItemsPerSource) body.maxItemsPerSource = body.limit;

  const sourceId = String(body.sourceId ?? "").trim();
  let channel = String(body.channel ?? "").trim().toLowerCase();

  if (sourceId) {
    const source = await admin
      .from("content_sources")
      .select("id,active,metadata")
      .eq("id", sourceId)
      .maybeSingle();
    if (source.error) return json({ error: source.error.message }, 500);
    if (!source.data || source.data.active !== true) return json({ error: "Kaynak bulunamadı veya pasif." }, 404);
    channel = String(source.data.metadata?.channel ?? channel).toLowerCase();
  }

  if (!channel) channel = "news";
  if (channel === "guide_reference" || channel === "guide_catalog") channel = "guide";
  if (!new Set(["news", "guide"]).has(channel)) {
    return json({ error: `Desteklenmeyen içerik kanalı: ${channel}` }, 400);
  }

  const target = channel === "guide" ? "knowledge-content-scan" : "content-engine-scan";
  const forwardBody: Record<string, unknown> = { ...body, channel };
  if (channel === "guide") {
    forwardBody.limit = Math.min(Math.max(Number(body.limit ?? body.maxItemsPerSource ?? 2), 1), 8);
    delete forwardBody.maxItemsPerSource;
  }

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/${target}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
        "apikey": serviceKey,
        ...(access.cron ? { "x-cron-token": access.cron } : {}),
      },
      body: JSON.stringify(forwardBody),
      signal: AbortSignal.timeout(120000),
    });
    const text = await response.text();
    let payload: any;
    try { payload = JSON.parse(text); } catch { payload = { raw: text }; }

    return json({
      ok: response.ok,
      router: "content-harvest-v5-guide-aliases",
      channel,
      target,
      upstreamStatus: response.status,
      ...payload,
    }, response.status);
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : String(error),
      router: "content-harvest-v5-guide-aliases",
      channel,
      target,
    }, 500);
  }
});
