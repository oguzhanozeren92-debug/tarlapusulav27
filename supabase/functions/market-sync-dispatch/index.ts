import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-market-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  });

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function authorized(req: Request) {
  const supplied = String(req.headers.get('x-market-cron-secret') || '').trim();
  if (!supplied) return false;
  const { data, error } = await admin.rpc('verify_market_sync_secret', {
    p_secret: supplied,
  });
  if (error) {
    console.error('[market-sync-dispatch] secret verify:', error.message);
    return false;
  }
  return data === true;
}

async function invoke(name: string, body: Record<string, unknown>) {
  const response = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text.slice(0, 1000) };
  }
  if (!response.ok || payload?.success === false) {
    throw new Error(`${name} ${response.status}: ${payload?.error || text.slice(0, 500)}`);
  }
  return payload;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ success: false, error: 'POST kullanın.' }, 405);

  try {
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ success: false, error: 'Sunucu yapılandırması eksik.' }, 503);
    }
    if (!(await authorized(req))) {
      return json({ success: false, error: 'Yetkisiz market senkronizasyon isteği.' }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || 'status');

    if (action === 'fertilizer') {
      const result = await invoke('fertilizer-price-sync', { action: 'sync' });
      return json({ success: true, action, result });
    }

    if (action === 'tobb_catalog') {
      const result = await invoke('tobb-market-sync', { action: 'catalog' });
      return json({ success: true, action, result });
    }

    if (action === 'tobb_batch') {
      const offset = Math.max(0, Number(body?.offset || 0));
      const limit = Math.max(1, Math.min(60, Number(body?.limit || 60)));
      const result = await invoke('tobb-market-sync', { action: 'sync', offset, limit });
      return json({ success: true, action, offset, limit, result });
    }

    if (action === 'status') {
      const [{ count: cropCount }, { count: fertilizerCount }, { count: fuelCount }] = await Promise.all([
        admin.from('market_crop_prices').select('*', { count: 'exact', head: true }),
        admin.from('market_fertilizer_prices').select('*', { count: 'exact', head: true }),
        admin.from('market_fuel_prices').select('*', { count: 'exact', head: true }),
      ]);
      return json({
        success: true,
        action,
        counts: {
          crop: cropCount ?? 0,
          fertilizer: fertilizerCount ?? 0,
          fuel: fuelCount ?? 0,
        },
      });
    }

    return json({
      success: false,
      error: `Bilinmeyen action: ${action}`,
      allowedActions: ['fertilizer', 'tobb_catalog', 'tobb_batch', 'status'],
    }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[market-sync-dispatch]', message);
    return json({ success: false, error: message }, 500);
  }
});
