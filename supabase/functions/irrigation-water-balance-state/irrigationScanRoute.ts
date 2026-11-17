/**
 * Günlük sulama ihtiyacı taraması için cron girişi (x-cron-secret).
 * Kullanıcı istekleri bu yola girmez; onlar mevcut su dengesi akışına devam eder.
 * Proje edge function sınırında olduğu için tarama bu fonksiyonun içinde çalışır.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.112.4';
import { enqueueFieldIrrigationNeedAlerts } from './irrigationNeed.ts';
import { enqueuePestCalendarReminders } from './pestReminderScan.ts';

export async function handleIrrigationScan(req: Request): Promise<Response> {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false, autoRefreshToken: false } });
  const supplied = req.headers.get('x-cron-secret') ?? '';
  const legacy = Deno.env.get('PUSH_CRON_SECRET') ?? '';
  let ok = Boolean(legacy && supplied === legacy);
  if (!ok && supplied) {
    const { data, error } = await db.rpc('verify_push_dispatch_secret', { p_secret: supplied });
    ok = !error && data === true;
  }
  if (!ok) return new Response(JSON.stringify({ ok: false, error: 'Unauthorized cron request.' }), { status: 401, headers });
  try {
    const stats = await enqueueFieldIrrigationNeedAlerts(db);
    let pest: Record<string, unknown>;
    try { pest = await enqueuePestCalendarReminders(db); }
    catch (error) { pest = { error: error instanceof Error ? error.message : 'pest_scan_error' }; console.error('[pest-scan]', error); }
    return new Response(JSON.stringify({ ok: true, ...stats, pest }), { headers });
  } catch (error) {
    console.error('[irrigation-need-scan]', error);
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'scan_error' }), { status: 500, headers });
  }
}
