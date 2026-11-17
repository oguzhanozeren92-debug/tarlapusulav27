/**
 * Günlük sulama ihtiyacı taraması (pg_cron, 30 dakikada bir; her çalışmada en fazla 10 tarla).
 * Bildirimleri app_notifications'a yazar; telefona gönderimi send-due-reminders yapar
 * (kullanıcının sulama bildirimi tercihi, sessiz saatler ve günlük sınır orada uygulanır).
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { enqueueFieldIrrigationNeedAlerts } from "./irrigationNeed.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } });

async function authorized(req: Request) {
  const supplied = req.headers.get("x-cron-secret") || "";
  if (!supplied) return false;
  const legacy = Deno.env.get("PUSH_CRON_SECRET") || "";
  if (legacy && supplied === legacy) return true;
  const { data, error } = await db.rpc("verify_push_dispatch_secret", { p_secret: supplied });
  return !error && data === true;
}

Deno.serve(async (req) => {
  const headers = { "Content-Type": "application/json" };
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST gerekli." }), { status: 405, headers });
  if (!(await authorized(req))) return new Response(JSON.stringify({ error: "Unauthorized cron request." }), { status: 401, headers });
  try {
    const stats = await enqueueFieldIrrigationNeedAlerts(db);
    return new Response(JSON.stringify({ ok: true, ...stats }), { headers });
  } catch (error) {
    console.error("Sulama ihtiyacı taraması başarısız:", error);
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "scan_error" }), { status: 500, headers });
  }
});
