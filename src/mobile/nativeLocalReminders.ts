import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

// Local, opt-in weekly field-planning reminder, independent of APNs.
// Real satellite, weather and PDF alerts must still use the remote push server.
const KEY = 'tp:local-notifications:v1';
const IDS = Array.from({ length: 8 }, (_, i) => 765100 + i);
const TEST_ID = 765199;
export const nativeLocalSupported = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios' &&
  Capacitor.isPluginAvailable('LocalNotifications');
export const nativeLocalEnabled = () => {
  try { return localStorage.getItem(KEY) === 'on'; } catch { return false; }
};
async function cancelOurs() {
  const pending = await LocalNotifications.getPending();
  const ours = pending.notifications.filter(n => IDS.includes(n.id)).map(n => ({ id: n.id }));
  if (ours.length) await LocalNotifications.cancel({ notifications: ours });
}
export async function syncNativeLocalReminders() {
  if (!nativeLocalSupported()) return 0;
  await cancelOurs();
  if (!nativeLocalEnabled() || (await LocalNotifications.checkPermissions()).display !== 'granted') return 0;
  const now = new Date();
  const first = new Date(now);
  first.setHours(9, 30, 0, 0);
  first.setDate(first.getDate() + ((8 - first.getDay()) % 7));
  if (first.getTime() <= now.getTime() + 60000) first.setDate(first.getDate() + 7);
  await LocalNotifications.schedule({ notifications: IDS.map((id, i) => {
    const at = new Date(first);
    at.setDate(first.getDate() + i * 7);
    return {
      id, title: '🌱 TarlaPusula · Haftalık tarla kontrolü',
      body: 'Tarlalarının durumunu, görevlerini ve güncel uydu verilerini gözden geçirmek ister misin?',
      schedule: { at }, foreground: false, extra: { target: 'calendar', source: 'tp-local' }
    };
  }) });
  return IDS.length;
}
export async function enableNativeLocalReminders() {
  if (!nativeLocalSupported()) throw new Error('Bu iPhone build’inde bildirim eklentisi bulunmuyor.');
  const permission = await LocalNotifications.requestPermissions();
  if (permission.display !== 'granted') throw new Error('Bildirim izni verilmedi. iPhone Ayarlarından açabilirsin.');
  localStorage.setItem(KEY, 'on');
  try {
    await syncNativeLocalReminders();
  } catch (error) {
    localStorage.removeItem(KEY);
    throw error;
  }
  return true;
}
export async function disableNativeLocalReminders() {
  if (nativeLocalSupported()) await cancelOurs();
  localStorage.setItem(KEY, 'off');
}
export async function testNativeLocalReminder() {
  if (!nativeLocalSupported() || (await LocalNotifications.checkPermissions()).display !== 'granted')
    throw new Error('Önce bildirim izni vermelisin.');
  await LocalNotifications.schedule({ notifications: [{
    id: TEST_ID, title: '🔔 TarlaPusula bildirim testi',
    body: 'Test başarılı! iPhone bildirimleri açıldı.',
    schedule: { at: new Date(Date.now() + 5000) },
    extra: { source: 'tp-local-test', target: 'calendar' }, foreground: false
  }] });
}
