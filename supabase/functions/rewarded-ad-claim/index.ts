import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.112.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

function clean(value: unknown, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, error: 'Yalnız POST desteklenir.' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const authorization = req.headers.get('Authorization') ?? '';

    if (!supabaseUrl || !anonKey || !serviceKey || !authorization) {
      throw new Error('Reklam ödülü sunucu yapılandırması eksik.');
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) {
      return json({ ok: false, error: 'Geçerli kullanıcı oturumu gerekli.' }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const placement = clean(body?.placement, 80);
    const provider = clean(body?.provider, 80);
    const transactionId = clean(body?.transactionId ?? body?.transaction_id, 220);
    const verificationPayload =
      body?.verificationPayload && typeof body.verificationPayload === 'object'
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

    let verified = false;
    let verificationMode = '';

    if (provider === 'dev_mock') {
      const { data: isAdmin, error: adminError } = await userClient.rpc('is_admin');
      if (adminError || isAdmin !== true) {
        return json(
          {
            ok: false,
            error:
              'Gerçek reklam sağlayıcısı henüz bağlı değil. Test reklamı yalnız admin önizlemesinde kullanılabilir.',
          },
          409,
        );
      }
      verified = true;
      verificationMode = 'admin_dev_mock';
    } else {
      const verifyUrl = clean(Deno.env.get('AD_REWARD_VERIFY_URL'), 1000);
      const verifySecret = clean(Deno.env.get('AD_REWARD_VERIFY_SECRET'), 1000);

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
            userId: authData.user.id,
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
      return json({ ok: false, error: 'Reklam tamamlandığı doğrulanamadı.' }, 409);
    }

    const { data, error } = await admin.rpc('tp_award_verified_ad_reward', {
      p_user_id: authData.user.id,
      p_provider: provider,
      p_provider_transaction_id: transactionId,
      p_placement: placement,
      p_metadata: {
        ...metadata,
        verification_mode: verificationMode,
      },
    });

    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    return json({
      ok: true,
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
    const message = error instanceof Error ? error.message : 'Reklam ödülü tamamlanamadı.';
    console.error('[rewarded-ad-claim]', message);
    return json({ ok: false, error: message }, 500);
  }
});
