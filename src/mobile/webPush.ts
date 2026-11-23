import { supabase } from '../supabaseClient';
import { urlBase64ToUint8Array } from '../utils/fileUtils';

const DISMISSED_KEY = 'tp:web-push-offered:v1';

export function webPushOfferDismissed() {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissWebPushOffer() {
  try {
    window.localStorage.setItem(DISMISSED_KEY, '1');
  } catch {
    // localStorage kapalı olabilir; sorun değil.
  }
}

export function webPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    Boolean(import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim())
  );
}

async function savePushSubscription(subscription: PushSubscription) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error('Bildirimleri açmak için giriş yapmalısın.');

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint: subscription.endpoint,
      subscription: subscription.toJSON(),
      user_agent: navigator.userAgent,
      enabled: true,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  );

  if (error) throw error;
}

export async function enableWebPushNotifications() {
  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim();
  if (!vapidPublicKey) {
    throw new Error('Tarayıcı bildirimleri şu an kullanılamıyor.');
  }

  if (
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !('Notification' in window)
  ) {
    throw new Error('Bu tarayıcı push bildirimlerini desteklemiyor.');
  }

  if (Notification.permission === 'denied') {
    throw new Error(
      'Bildirim izni tarayıcıda kapalı. Adres çubuğundaki site ayarlarından Bildirimler → İzin ver seçmen gerekiyor.',
    );
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Bildirim izni verilmedi. İstersen daha sonra tekrar açabilirsin.');
  }

  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
  }

  await savePushSubscription(subscription);

  try {
    await registration.showNotification('TarlaPusula bildirimleri açık', {
      body: 'Uydu, hava ve Pusula uyarılarını artık burada görebilirsin.',
      tag: 'tarlapusula-push-enabled',
      data: { url: window.location.origin },
    });
  } catch {
    // Bildirim gösterimi başarısız olsa da abonelik zaten kaydedildi.
  }

  return subscription;
}
