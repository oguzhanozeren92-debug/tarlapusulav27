import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import {
  PushNotifications,
  type PermissionStatus,
  type PushNotificationSchema,
} from '@capacitor/push-notifications';
import { supabase } from '../supabaseClient';

const INSTALLATION_KEY = 'tp_native_installation_id_v1';
const REGISTERED_KEY = 'tp_native_push_registered_v1';
const CHANNEL_ID = 'tarlapusula_general';

let listenersInstalled = false;
let lastToken = '';
let registrationPromise: Promise<string> | null = null;
let registrationResolve: ((value: string) => void) | null = null;
let registrationReject: ((reason?: unknown) => void) | null = null;

export type NativePushStatus = {
  supported: boolean;
  enabled: boolean;
  permission: PermissionStatus['receive'] | 'unsupported';
};

function installationId() {
  try {
    const existing = window.localStorage.getItem(INSTALLATION_KEY);
    if (existing) return existing;

    const generated =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `tp-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    window.localStorage.setItem(INSTALLATION_KEY, generated);
    return generated;
  } catch {
    return `tp-session-${Date.now()}`;
  }
}

function apnsEnvironment() {
  return import.meta.env.VITE_APNS_ENVIRONMENT === 'production'
    ? 'production'
    : 'sandbox';
}

async function saveNativeToken(token: string) {
  const platform = Capacitor.getPlatform();
  if (platform !== 'ios' && platform !== 'android') return;

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return;

  let appVersion: string | null = null;
  try {
    const info = await App.getInfo();
    appVersion = [info.version, info.build].filter(Boolean).join(' (') +
      (info.build ? ')' : '');
  } catch {
    // Version bilgisi push kaydını engellemez.
  }

  const now = new Date().toISOString();
  const payload = {
    user_id: user.id,
    platform,
    installation_id: installationId(),
    token,
    environment: platform === 'ios' ? apnsEnvironment() : 'production',
    enabled: true,
    app_id: 'com.tarlapusula.app',
    app_version: appVersion,
    user_agent: navigator.userAgent,
    last_seen_at: now,
    updated_at: now,
  };

  const { error } = await supabase
    .from('native_push_tokens')
    .upsert(payload, {
      onConflict: 'user_id,platform,installation_id',
    });

  if (error) {
    console.warn('[native-push] Cihaz tokenı kaydedilemedi:', error.message);
    return;
  }

  try {
    window.localStorage.setItem(REGISTERED_KEY, '1');
  } catch {
    // localStorage kapalı olabilir.
  }
}

function dispatchNotificationOpen(notification: PushNotificationSchema) {
  if (typeof window === 'undefined') return;

  const data =
    notification?.data && typeof notification.data === 'object'
      ? notification.data
      : {};

  window.dispatchEvent(
    new CustomEvent('tp:native-notification-open', {
      detail: {
        ...data,
        notificationId:
          data.notificationId ?? data.notification_id ?? notification.id ?? null,
        title: notification.title ?? '',
        body: notification.body ?? '',
      },
    }),
  );
}

async function ensureAndroidChannel() {
  if (Capacitor.getPlatform() !== 'android') return;

  try {
    await PushNotifications.createChannel({
      id: CHANNEL_ID,
      name: 'TarlaPusula Bildirimleri',
      description: 'Tarla, hava, uydu ve Pusula uyarıları',
      importance: 4,
      visibility: 1,
      vibration: true,
    });
  } catch (error) {
    console.info('[native-push] Android bildirim kanalı oluşturulamadı:', error);
  }
}

async function ensureListeners() {
  if (listenersInstalled || !Capacitor.isNativePlatform()) return;
  listenersInstalled = true;

  await PushNotifications.addListener('registration', (token) => {
    lastToken = String(token.value ?? '').trim();

    if (lastToken) {
      void saveNativeToken(lastToken);
      registrationResolve?.(lastToken);
    } else {
      registrationReject?.(new Error('Cihaz bildirim tokenı boş döndü.'));
    }

    registrationPromise = null;
    registrationResolve = null;
    registrationReject = null;
  });

  await PushNotifications.addListener('registrationError', (error) => {
    const reason = new Error(
      String(error?.error ?? 'Native bildirim kaydı başarısız.'),
    );
    registrationReject?.(reason);
    registrationPromise = null;
    registrationResolve = null;
    registrationReject = null;
    console.warn('[native-push] Kayıt hatası:', reason.message);
  });

  await PushNotifications.addListener(
    'pushNotificationReceived',
    (notification) => {
      window.dispatchEvent(
        new CustomEvent('tp:native-notification-received', {
          detail: notification,
        }),
      );
    },
  );

  await PushNotifications.addListener(
    'pushNotificationActionPerformed',
    (event) => {
      dispatchNotificationOpen(event.notification);
    },
  );
}

function waitForRegistration() {
  if (lastToken) return Promise.resolve(lastToken);
  if (registrationPromise) return registrationPromise;

  registrationPromise = new Promise<string>((resolve, reject) => {
    registrationResolve = resolve;
    registrationReject = reject;

    window.setTimeout(() => {
      if (!registrationPromise) return;
      registrationPromise = null;
      registrationResolve = null;
      registrationReject = null;
      reject(new Error('Bildirim cihaz kaydı zaman aşımına uğradı.'));
    }, 15000);
  });

  return registrationPromise;
}

export function isNativePushPlatform() {
  return (
    Capacitor.isNativePlatform() &&
    Capacitor.isPluginAvailable('PushNotifications')
  );
}

export async function getNativePushStatus(): Promise<NativePushStatus> {
  if (!isNativePushPlatform()) {
    return {
      supported: false,
      enabled: false,
      permission: 'unsupported',
    };
  }

  const permission = await PushNotifications.checkPermissions();
  return {
    supported: true,
    enabled: permission.receive === 'granted',
    permission: permission.receive,
  };
}

export async function enableNativePushNotifications() {
  if (!isNativePushPlatform()) {
    throw new Error('Native bildirim sistemi bu cihazda kullanılamıyor.');
  }

  await ensureListeners();
  await ensureAndroidChannel();

  let permission = await PushNotifications.checkPermissions();
  if (
    permission.receive === 'prompt' ||
    permission.receive === 'prompt-with-rationale'
  ) {
    permission = await PushNotifications.requestPermissions();
  }

  if (permission.receive !== 'granted') {
    throw new Error(
      'Bildirim izni verilmedi. Telefon ayarlarından TarlaPusula bildirimlerini açabilirsin.',
    );
  }

  const tokenPromise = waitForRegistration();
  await PushNotifications.register();
  const token = await tokenPromise;
  await saveNativeToken(token);

  return {
    supported: true,
    enabled: true,
    permission: permission.receive,
    token,
  };
}

export async function disableNativePushNotifications() {
  if (!isNativePushPlatform()) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const platform = Capacitor.getPlatform();
    await supabase
      .from('native_push_tokens')
      .update({
        enabled: false,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)
      .eq('platform', platform)
      .eq('installation_id', installationId());
  }

  try {
    await PushNotifications.unregister();
  } finally {
    lastToken = '';
    try {
      window.localStorage.removeItem(REGISTERED_KEY);
    } catch {
      // no-op
    }
  }
}

export async function refreshNativePushRegistration() {
  if (!isNativePushPlatform()) return;

  await ensureListeners();
  await ensureAndroidChannel();

  const permission = await PushNotifications.checkPermissions();
  if (permission.receive !== 'granted') return;

  try {
    const tokenPromise = waitForRegistration();
    await PushNotifications.register();
    const token = await tokenPromise;
    await saveNativeToken(token);
  } catch (error) {
    console.info('[native-push] Sessiz token yenileme tamamlanamadı:', error);
  }
}
