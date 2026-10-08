import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

const has = (name: string) => Boolean(String(Deno.env.get(name) || '').trim());

async function authorized(req: Request) {
  const supplied = String(req.headers.get('x-release-probe-secret') || '').trim();
  if (!supplied) return false;
  const { data, error } = await admin.rpc('verify_release_probe_secret', {
    p_secret: supplied,
  });
  return !error && data === true;
}

async function authProviders() {
  if (!supabaseUrl || !anonKey) {
    return { ok: false, google: false, facebook: false, apple: false };
  }
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: anonKey },
    });
    const payload = await response.json().catch(() => ({}));
    const external = payload?.external && typeof payload.external === 'object'
      ? payload.external
      : {};
    return {
      ok: response.ok,
      google: external.google === true,
      facebook: external.facebook === true,
      apple: external.apple === true,
    };
  } catch {
    return { ok: false, google: false, facebook: false, apple: false };
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'POST kullanın.' }, 405);
  if (!(await authorized(req))) return json({ ok: false, error: 'Yetkisiz.' }, 401);

  const providers = await authProviders();
  const readiness = {
    checkedAt: new Date().toISOString(),
    auth: providers,
    revenueCatBackend: {
      secretApiKey: has('REVENUECAT_SECRET_API_KEY'),
      webhookAuth: has('REVENUECAT_WEBHOOK_AUTH'),
    },
    webPush: {
      vapidPublic: has('VAPID_PUBLIC_KEY'),
      vapidPrivate: has('VAPID_PRIVATE_KEY'),
      vapidSubject: has('VAPID_SUBJECT'),
    },
    androidPush: {
      fcmServiceAccountJson: has('FCM_SERVICE_ACCOUNT_JSON'),
      fcmSplitCredentials:
        has('FCM_PROJECT_ID') && has('FCM_CLIENT_EMAIL') && has('FCM_PRIVATE_KEY'),
    },
    iosPush: {
      apnsKeyId: has('APNS_KEY_ID'),
      apnsTeamId: has('APNS_TEAM_ID'),
      apnsPrivateKey: has('APNS_PRIVATE_KEY'),
      apnsBundleId: has('APNS_BUNDLE_ID'),
    },
  };

  const { error } = await admin.from('internal_service_config').upsert({
    key: 'release_readiness_probe',
    value: JSON.stringify(readiness),
    updated_at: new Date().toISOString(),
  });
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, readiness });
});
