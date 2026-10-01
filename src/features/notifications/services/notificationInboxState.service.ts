import { supabase } from '../../../supabaseClient';

const SYSTEM_NOTIFICATIONS_KEY = 'tp_system_notifications_v1';
const HIDDEN_NOTIFICATIONS_KEY = 'tp_hidden_notifications_v1';
const READ_NOTIFICATIONS_KEY = 'tp_read_notifications_v1';
const INBOX_EVENT = 'tp:notification-inbox-state';

export type StoredInboxNotification = {
  id: string;
  fieldId?: string | null;
  fieldName?: string | null;
  source?: string | null;
  severity?: string | null;
  title?: string | null;
  message?: string | null;
  detail?: string | null;
  iconKey?: string | null;
  target?: string | null;
  priority?: number | null;
  kind?: string | null;
  task?: Record<string, unknown> | null;
  isRead?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
  [key: string]: unknown;
};

function safeArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item ?? '').trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function bounded(values: Iterable<string>, max = 500) {
  return Array.from(new Set(Array.from(values).map((value) => String(value).trim()).filter(Boolean)))
    .slice(-max);
}

function emitInboxState() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(INBOX_EVENT));
  window.dispatchEvent(new CustomEvent('tp:notifications-updated'));
}

export function readStoredInboxNotifications(): StoredInboxNotification[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SYSTEM_NOTIFICATIONS_KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed.filter((item) => item && typeof item === 'object' && item.kind !== 'task')
      : [];
  } catch {
    return [];
  }
}

function writeStoredInboxNotifications(items: StoredInboxNotification[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SYSTEM_NOTIFICATIONS_KEY, JSON.stringify(items));
  } catch {
    // localStorage kullanılamıyorsa yalnız mevcut oturum devam eder.
  }
}

export function readHiddenNotificationIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  return new Set(safeArray(window.localStorage.getItem(HIDDEN_NOTIFICATIONS_KEY)));
}

export function readReadNotificationIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  return new Set(safeArray(window.localStorage.getItem(READ_NOTIFICATIONS_KEY)));
}

export function isNotificationHidden(id: string) {
  return readHiddenNotificationIds().has(String(id));
}

export function isNotificationRead(id: string, fallback = false) {
  const normalizedId = String(id ?? '').trim();
  if (!normalizedId) return fallback;
  if (readReadNotificationIds().has(normalizedId)) return true;
  const stored = readStoredInboxNotifications().find((item) => String(item.id) === normalizedId);
  return Boolean(stored?.isRead ?? fallback);
}

export function hideNotificationLocally(id: string) {
  if (typeof window === 'undefined') return;
  const normalizedId = String(id ?? '').trim();
  if (!normalizedId) return;

  const next = readHiddenNotificationIds();
  next.add(normalizedId);
  window.localStorage.setItem(HIDDEN_NOTIFICATIONS_KEY, JSON.stringify(bounded(next)));
  emitInboxState();
}

function updateLocalReadState(ids: Set<string>) {
  if (typeof window === 'undefined' || !ids.size) return;

  const readIds = readReadNotificationIds();
  ids.forEach((id) => readIds.add(id));
  window.localStorage.setItem(READ_NOTIFICATIONS_KEY, JSON.stringify(bounded(readIds)));

  const stored = readStoredInboxNotifications();
  let changed = false;
  const next = stored.map((item) => {
    if (!ids.has(String(item.id)) || item.isRead) return item;
    changed = true;
    return { ...item, isRead: true };
  });
  if (changed) writeStoredInboxNotifications(next);
}

function databaseIds(ids: Iterable<string>) {
  return Array.from(ids)
    .map((id) => String(id))
    .filter((id) => id.startsWith('db:'))
    .map((id) => id.slice(3))
    .filter(Boolean);
}

export async function markNotificationsRead(idsInput: Iterable<string>) {
  const ids = new Set(
    Array.from(idsInput)
      .map((id) => String(id ?? '').trim())
      .filter(Boolean),
  );
  if (!ids.size) return;

  updateLocalReadState(ids);
  emitInboxState();

  const dbIds = databaseIds(ids);
  if (!dbIds.length || !supabase) return;

  try {
    const { error } = await supabase
      .from('app_notifications')
      .update({ is_read: true })
      .in('id', dbIds);
    if (error) throw error;
  } catch (error) {
    console.warn('[notifications] Okundu durumu sunucuya yazılamadı:', error);
  }
}

export async function markNotificationRead(id: string) {
  await markNotificationsRead([id]);
}

export function visibleNotificationIds(ids: Iterable<string>) {
  const hidden = readHiddenNotificationIds();
  return Array.from(ids).filter((id) => !hidden.has(String(id)));
}

export function subscribeNotificationInboxState(callback: () => void) {
  if (typeof window === 'undefined') return () => undefined;
  const handler = () => callback();
  window.addEventListener(INBOX_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(INBOX_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}
