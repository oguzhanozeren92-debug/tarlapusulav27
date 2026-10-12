import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../../supabaseClient';
import type { WeeklyPusulaReport } from './types';
import { savePusulaPdfOnDevice } from './services/pusulaPdfLocalFile.service';

export const PUSULAPDF_ALERT_KEY = 'tp_pusulapdf_ready_alert_v1';

type ReadyNotice = {
  userId: string;
  reportId: string;
  fieldId: string;
  fieldName: string;
  notificationId: string;
};

function seenKey(userId: string) {
  return `tp_pusulapdf_seen_v1:${userId}`;
}

function loadSeen(userId: string) {
  try {
    const parsed = JSON.parse(localStorage.getItem(seenKey(userId)) || '[]') as unknown;
    return new Set<string>(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set<string>();
  }
}

function saveSeen(userId: string, ids: Set<string>) {
  try {
    localStorage.setItem(seenKey(userId), JSON.stringify([...ids].slice(-80)));
  } catch {
    // This signal is best effort; the notification stays in app_notifications.
  }
}

export default function PusulaPdfReadyBridge() {
  useEffect(() => {
    let live = true;
    let currentUser = '';
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let pollInProgress = false;

    const sync = async () => {
      if (!live || pollInProgress) return;
      if (document.visibilityState === 'hidden') return;
      pollInProgress = true;
      try {
        const { data: auth } = await supabase.auth.getUser();
        const userId = auth.user?.id ?? '';
        if (!userId) return;
        const { data: notifications, error } = await supabase
          .from('app_notifications')
          .select('id,source,target,data,created_at,is_read')
          .eq('user_id', userId)
          .eq('source', 'pusulapdf')
          .eq('target', 'pusulapdf')
          .order('created_at', { ascending: false })
          .limit(8);
        if (error) throw error;

        const seen = loadSeen(userId);
        for (const notice of [...(notifications ?? [])].reverse()) {
          const reportId = String((notice.data as Record<string, unknown> | null)?.reportId ?? '').trim();
          const fieldId = String((notice.data as Record<string, unknown> | null)?.fieldId ?? '').trim();
          if (!reportId || !fieldId) continue;
          const notificationId = String(notice.id);
          const wasSeen = seen.has(notificationId);
          const created = new Date(notice.created_at).getTime();
          if (!Number.isFinite(created) || Date.now() - created > 7 * 86400000) continue;
          if (wasSeen && !Capacitor.isNativePlatform()) continue;

          const { data: report, error: reportError } = await supabase
            .from('weekly_field_reports').select('*')
            .eq('id', reportId).eq('user_id', userId).eq('status', 'ready')
            .maybeSingle();
          if (reportError || !report || !live) continue;
          const item = report as WeeklyPusulaReport;

          if (Capacitor.isNativePlatform()) {
            // Cache as soon as the app is active. iOS cannot execute this JS
            // while force-closed; the next app launch completes the download.
            void savePusulaPdfOnDevice(item).then((saved) => {
              if (saved && live) {
                window.dispatchEvent(new CustomEvent('tp:pusulapdf-cached', {
                  detail: { reportId: item.id, fileName: saved.fileName },
                }));
              }
            }).catch((err) => {
              console.warn('[PUSULAPDF] Cihaz içi otomatik kayıt ertelendi:', err);
            });
          }

          if (!wasSeen && !notice.is_read) {
            const data: ReadyNotice = {
              userId,
              reportId,
              fieldId,
              fieldName: String(item.report_data?.field?.name || 'Tarlan'),
              notificationId,
            };
            try { sessionStorage.setItem(PUSULAPDF_ALERT_KEY, JSON.stringify(data)); } catch { /* storage disabled */ }
            window.dispatchEvent(new CustomEvent('tp:pusulapdf-ready', { detail: data }));
          }
          seen.add(notificationId);
        }
        saveSeen(userId, seen);
      } catch (err) {
        console.warn('[PUSULAPDF] Rapor bildirimleri alınamadı:', err);
      } finally {
        pollInProgress = false;
      }
    };

    const connect = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!live) return;
      const userId = auth.user?.id ?? '';
      if (currentUser === userId && channel) return;
      currentUser = userId;
      void channel?.unsubscribe();
      channel = null;
      if (!userId) {
        try { sessionStorage.removeItem(PUSULAPDF_ALERT_KEY); } catch { /* noop */ }
        return;
      }
      channel = supabase
        .channel(`tp-pusulapdf-ready-${userId}`)
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'app_notifications',
          filter: `user_id=eq.${userId}`,
        }, () => void sync())
        .subscribe();
      void sync();
    };

    void connect();
    const auth = supabase.auth.onAuthStateChange(() => { void connect(); });
    const timer = window.setInterval(() => void sync(), 30_000);
    const onResume = () => void sync();
    window.addEventListener('focus', onResume);
    document.addEventListener('visibilitychange', onResume);
    return () => {
      live = false;
      auth.data.subscription.unsubscribe();
      window.clearInterval(timer);
      window.removeEventListener('focus', onResume);
      document.removeEventListener('visibilitychange', onResume);
      void channel?.unsubscribe();
    };
  }, []);
  return null;
}
