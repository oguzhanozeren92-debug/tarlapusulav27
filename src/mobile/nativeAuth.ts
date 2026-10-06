import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../supabaseClient';

const NATIVE_CALLBACK = 'com.tarlapusula.app://auth-callback';
const MOBILE_BRIDGE_PARAM = 'tp_native_oauth';
const handledCallbacks = new Set<string>();

function publicWebUrl() {
  const configured = String(
    import.meta.env.VITE_PUBLIC_APP_URL ||
      import.meta.env.VITE_APP_URL ||
      'https://tarlapusulav27.vercel.app/',
  ).trim();

  try {
    return new URL(configured.endsWith('/') ? configured : `${configured}/`);
  } catch {
    return new URL('https://tarlapusulav27.vercel.app/');
  }
}

function mobileBridgeUrl() {
  const url = publicWebUrl();
  url.searchParams.set(MOBILE_BRIDGE_PARAM, '1');
  return url.toString();
}

export function isNativeOAuthAvailable() {
  return (
    Capacitor.isNativePlatform() &&
    Capacitor.isPluginAvailable('App') &&
    Capacitor.isPluginAvailable('Browser')
  );
}

export async function startNativeOAuth(
  provider: 'google' | 'facebook',
) {
  if (!isNativeOAuthAvailable()) {
    throw new Error('Native giriş sistemi bu cihazda kullanılamıyor.');
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: mobileBridgeUrl(),
      skipBrowserRedirect: true,
    },
  });

  if (error) throw error;
  if (!data?.url) {
    throw new Error('Giriş bağlantısı hazırlanamadı.');
  }

  await Browser.open({
    url: data.url,
  });
}

function callbackParams(source: URL) {
  const params = new URLSearchParams(source.search);

  if (source.hash) {
    const hashParams = new URLSearchParams(
      source.hash.startsWith('#')
        ? source.hash.slice(1)
        : source.hash,
    );

    hashParams.forEach((value, key) => {
      if (!params.has(key)) params.set(key, value);
    });
  }

  return params;
}

export function forwardWebOAuthCallbackToNative() {
  if (
    typeof window === 'undefined' ||
    Capacitor.isNativePlatform()
  ) {
    return false;
  }

  const source = new URL(window.location.href);
  const params = callbackParams(source);

  if (params.get(MOBILE_BRIDGE_PARAM) !== '1') {
    return false;
  }

  const target = new URL(NATIVE_CALLBACK);

  for (const key of [
    'code',
    'sb_flow_id',
    'error',
    'error_code',
    'error_description',
  ]) {
    const value = params.get(key);
    if (value) target.searchParams.set(key, value);
  }

  window.location.replace(target.toString());
  return true;
}

function authErrorMessage(params: URLSearchParams) {
  return (
    params.get('error_description') ||
    params.get('error') ||
    params.get('error_code') ||
    'Sosyal giriş tamamlanamadı.'
  );
}

export async function handleNativeAuthCallback(rawUrl: string) {
  if (!isNativeOAuthAvailable()) return false;
  if (!rawUrl || handledCallbacks.has(rawUrl)) return false;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  if (
    url.protocol !== 'com.tarlapusula.app:' ||
    url.hostname !== 'auth-callback'
  ) {
    return false;
  }

  handledCallbacks.add(rawUrl);
  const params = callbackParams(url);

  try {
    await Browser.close();
  } catch {
    // Browser zaten kapanmış olabilir.
  }

  const oauthError = params.get('error');
  if (oauthError) {
    window.dispatchEvent(
      new CustomEvent('tp:native-auth-error', {
        detail: { message: authErrorMessage(params) },
      }),
    );
    return true;
  }

  const code = params.get('code');
  if (!code) {
    window.dispatchEvent(
      new CustomEvent('tp:native-auth-error', {
        detail: { message: 'Giriş dönüş kodu bulunamadı.' },
      }),
    );
    return true;
  }

  try {
    const flowId = params.get('sb_flow_id');
    const { data, error } = await supabase.auth.exchangeCodeForSession(
      code,
      flowId ? { flowId } : undefined,
    );

    if (error) throw error;
    if (!data.session?.user) {
      throw new Error('Giriş oturumu oluşturulamadı.');
    }

    window.dispatchEvent(
      new CustomEvent('tp:native-auth-complete'),
    );
  } catch (error) {
    window.dispatchEvent(
      new CustomEvent('tp:native-auth-error', {
        detail: {
          message:
            error instanceof Error
              ? error.message
              : 'Sosyal giriş tamamlanamadı.',
        },
      }),
    );
  }

  return true;
}

export async function installNativeAuthDeepLinkListener() {
  if (!isNativeOAuthAvailable()) {
    return () => undefined;
  }

  const launch = await App.getLaunchUrl();
  if (launch?.url) {
    void handleNativeAuthCallback(launch.url);
  }

  const handle = await App.addListener('appUrlOpen', ({ url }) => {
    void handleNativeAuthCallback(url);
  });

  return () => {
    void handle.remove();
  };
}
