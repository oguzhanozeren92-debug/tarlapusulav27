import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  CheckCheck,
  ChevronRight,
  CircleAlert,
  Leaf,
  Sprout,
} from 'lucide-react';
import SwipeDismissNotification from '../../features/notifications/components/SwipeDismissNotification';
import {
  hideNotificationLocally,
  isNotificationRead,
  markNotificationRead,
  markNotificationsRead,
  readHiddenNotificationIds,
  readStoredInboxNotifications,
  subscribeNotificationInboxState,
  type StoredInboxNotification,
} from '../../features/notifications/services/notificationInboxState.service';
import './NotificationsHubScreen.css';
import { supabase } from '../../supabaseClient';
import { openArchivedPusulaPdf } from '../../features/pusula-pdf/services/pusulaPdfArchive.service';
import type { WeeklyPusulaReport } from '../../features/pusula-pdf/types';

type FieldLike = {
  id: string | number;
  name?: string | null;
  crop?: string | null;
  demo?: boolean;
  [key: string]: unknown;
};

type NotificationsHubScreenProps = {
  fields?: FieldLike[];
  selectedFieldId?: string | number | null;
  setScreen: (screen: any) => void;
  onOpenFieldDetail?: (
    field: any,
    entry?: { actionTarget?: string | null },
  ) => void;
};

function relativeTime(value?: string | null) {
  if (!value) return '';
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return '';

  const delta = Date.now() - time;
  if (delta < 60_000) return 'Şimdi';
  if (delta < 3_600_000) return `${Math.max(1, Math.floor(delta / 60_000))} dk`;
  if (delta < 86_400_000) return `${Math.max(1, Math.floor(delta / 3_600_000))} sa`;
  return `${Math.max(1, Math.floor(delta / 86_400_000))} gün`;
}

function notificationIcon(item: StoredInboxNotification) {
  const source = String(item.source ?? '').toLocaleLowerCase('tr-TR');
  if (source.includes('risk') || item.severity === 'danger' || item.severity === 'critical') {
    return <CircleAlert size={18} />;
  }
  if (source.includes('satellite') || source.includes('pusula')) {
    return <Sprout size={18} />;
  }
  if (source.includes('nutrition') || source.includes('soil')) {
    return <Leaf size={18} />;
  }
  return <Bell size={18} />;
}

export default function NotificationsHubScreen({
  fields = [],
  selectedFieldId,
  setScreen,
  onOpenFieldDetail,
}: NotificationsHubScreenProps) {
  const realFields = useMemo(
    () =>
      fields.filter(
        (field) =>
          field &&
          field.id != null &&
          !field.demo &&
          !String(field.id).startsWith('demo'),
      ),
    [fields],
  );

  const initialFieldId = String(selectedFieldId ?? realFields[0]?.id ?? '');
  const [activeFieldId, setActiveFieldId] = useState(initialFieldId);
  const [notifications, setNotifications] = useState<StoredInboxNotification[]>(
    () => readStoredInboxNotifications(),
  );
  const [revision, setRevision] = useState(0);
  const [pdfActionMessage, setPdfActionMessage] = useState('');
  const [pdfOpening, setPdfOpening] = useState(false);

  useEffect(() => {
    if (initialFieldId && !activeFieldId) setActiveFieldId(initialFieldId);
  }, [initialFieldId, activeFieldId]);

  useEffect(() => {
    const refresh = () => {
      setNotifications(readStoredInboxNotifications());
      setRevision((value) => value + 1);
    };

    const onUpdated = () => refresh();
    window.addEventListener('tp:notifications-updated', onUpdated);
    const unsubscribe = subscribeNotificationInboxState(refresh);
    refresh();

    return () => {
      window.removeEventListener('tp:notifications-updated', onUpdated);
      unsubscribe();
    };
  }, []);

  const activeField = useMemo(
    () =>
      realFields.find((field) => String(field.id) === String(activeFieldId)) ??
      realFields[0] ??
      null,
    [realFields, activeFieldId],
  );

  const fieldId = String(activeField?.id ?? activeFieldId ?? '');

  const visibleNotifications = useMemo(() => {
    const hidden = readHiddenNotificationIds();
    return [...notifications]
      .filter((item) => !hidden.has(String(item.id)))
      .filter((item) => item.source === 'pusulapdf' || !fieldId || !item.fieldId || String(item.fieldId) === fieldId)
      .sort((a, b) => {
        const priorityDiff = Number(b.priority ?? 0) - Number(a.priority ?? 0);
        if (priorityDiff) return priorityDiff;
        const aTime = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
        const bTime = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
        return bTime - aTime;
      });
  }, [notifications, fieldId, revision]);

  const unreadCount = visibleNotifications.filter(
    (item) => !isNotificationRead(String(item.id), Boolean(item.isRead)),
  ).length;

  const markAllRead = useCallback(async () => {
    await markNotificationsRead(visibleNotifications.map((item) => String(item.id)));
    setNotifications(readStoredInboxNotifications());
    setRevision((value) => value + 1);
  }, [visibleNotifications]);

  const dismissNotification = useCallback((id: string) => {
    hideNotificationLocally(id);
    setRevision((value) => value + 1);
  }, []);

  const openNotification = useCallback(
    async (item: StoredInboxNotification) => {
      await markNotificationRead(String(item.id));
      setRevision((value) => value + 1);

      const target = String(
        (item.task as any)?.action_target ?? item.target ?? '',
      ).trim();

      if (item.task && activeField && typeof onOpenFieldDetail === 'function') {
        onOpenFieldDetail(activeField, { actionTarget: target || null });
        return;
      }

      if (target === 'pusulapdf') {
        if (pdfOpening) return;
        const reportId = String((item.data as Record<string, unknown> | undefined)?.reportId ?? '').trim();
        if (!reportId) {
          setPdfActionMessage('Rapor kimliği bulunamadı. PusulaPDF geçmişinden tekrar deneyin.');
          return;
        }
        setPdfOpening(true);
        setPdfActionMessage('PusulaPDF hazırlanıyor; raporu açma ve kaydetme ekranı birazdan gelecek.');
        try {
          const { data: report, error } = await supabase
            .from('weekly_field_reports')
            .select('*')
            .eq('id', reportId)
            .single();
          if (error) throw error;
          if (!report) throw new Error('Rapor bulunamadı.');
          await openArchivedPusulaPdf(report as WeeklyPusulaReport);
          setPdfActionMessage('Raporun paylaşım/kaydetme ekranı açıldı. Dosyalara Kaydet seçeneğini kullanabilirsin.');
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Rapor indirilemedi.';
          setPdfActionMessage(`PDF açılamadı: ${message} — Bildirime tekrar basarak deneyebilirsin.`);
        } finally {
          setPdfOpening(false);
        }
        return;
      }
      if (target === 'weather' || target === 'spray_weather') {
        setScreen('weatherHub');
        return;
      }
      if (target === 'calendar') {
        setScreen('calendar');
        return;
      }
      if (target === 'ai') {
        setScreen('aiAnalysis');
        return;
      }
      if (target === 'map_vegetation') {
        setScreen('fieldControlHub');
        return;
      }
      if (target === 'soil') {
        setScreen('home');
        window.setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent('tp:open-field-status', {
              detail: { fieldId: fieldId || null, initialTab: 'soil' },
            }),
          );
        }, 0);
        return;
      }
      if (target === 'irrigation_detail') {
        setScreen('home');
        window.setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent('tp:open-field-status', {
              detail: { fieldId: fieldId || null, initialTab: 'irrigation' },
            }),
          );
        }, 0);
        return;
      }
      if (target === 'field_growth') {
        setScreen('home');
        window.setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent('tp:open-field-status', {
              detail: { fieldId: fieldId || null, initialTab: 'plant' },
            }),
          );
        }, 0);
        return;
      }

      setScreen('home');
    },
    [activeField, fieldId, onOpenFieldDetail, setScreen, pdfOpening],
  );

  return (
    <main className="tp-notifications-page">
      <section className="tp-notifications-shell">
        <header className="tp-notifications-header">
          <div>
            <span className="tp-notifications-kicker">BİLDİRİM MERKEZİ</span>
            <h1>Bildirimler</h1>
            <p>Uyarılar ve gelişmeler burada. Görevler ayrı Görevlerim alanında yönetilir.</p>
          </div>

          <div className="tp-notifications-header-actions">
            {realFields.length > 1 && (
              <label className="tp-notifications-field-picker">
                <span>Tarla</span>
                <select
                  className="tp-global-field-select"
                  value={fieldId}
                  onChange={(event) => setActiveFieldId(event.target.value)}
                >
                  {realFields.map((field) => (
                    <option key={String(field.id)} value={String(field.id)}>
                      {field.name || 'Tarla'}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <button
              type="button"
              className="tp-notifications-home-button"
              onClick={() => setScreen('home')}
            >
              Ana ekran
            </button>
          </div>
        </header>

        <section className="tp-notification-feed">
          <div className="tp-notification-feed-head">
            <div>
              <span>GÜNCEL GELİŞMELER</span>
              <h2>{fieldId ? activeField?.name || 'Seçili tarla' : 'Tüm bildirimler'}</h2>
              <small>Sola kaydır → bu ekrandan gizle. Kayıt veritabanından silinmez.</small>
            </div>

            <div className="tp-notification-feed-actions">
              {unreadCount > 0 && <span>{unreadCount} okunmamış</span>}
              {visibleNotifications.length > 0 && (
                <button type="button" onClick={() => void markAllRead()}>
                  <CheckCheck size={15} />
                  Tümünü okundu işaretle
                </button>
              )}
            </div>
          </div>

          {pdfActionMessage && (
            <p role="status" aria-live="polite" style={{
              margin:'8px 2px 14px',padding:'12px',border:'1px solid #d5dce0',
              borderRadius:12,background:'#fff',color:'#111',fontSize:13,
            }}>
              {pdfActionMessage}
            </p>
          )}
          {visibleNotifications.length === 0 ? (
            <div className="tp-notification-empty">
              <Bell size={20} />
              <div>
                <strong>Şimdilik yeni bildirim yok</strong>
                <span>Pusula yeni bir gelişme yakaladığında burada gösterecek.</span>
              </div>
            </div>
          ) : (
            <div className="tp-notification-list">
              {visibleNotifications.map((item, index) => {
                const read = isNotificationRead(String(item.id), Boolean(item.isRead));
                return (
                  <SwipeDismissNotification
                    key={String(item.id)}
                    notificationId={String(item.id)}
                    onDismiss={dismissNotification}
                    className={index % 2 === 1 ? 'is-zebra' : ''}
                  >
                    <button
                      type="button"
                      className={`tp-notification-item ${read ? 'is-read' : 'is-unread'}`}
                      onClick={() => void openNotification(item)}
                      disabled={pdfOpening && item.target === 'pusulapdf'}
                    >
                      <span className="tp-notification-item-icon">
                        {notificationIcon(item)}
                      </span>

                      <span className="tp-notification-item-copy">
                        <small>
                          BİLDİRİM{item.fieldName ? ` · ${item.fieldName}` : ''}
                        </small>
                        <strong>{item.title || 'Tarla güncellemesi'}</strong>
                        <em>{item.message || item.detail || 'Detayı görmek için aç.'}</em>
                      </span>

                      <span className="tp-notification-item-meta">
                        <small>{relativeTime(item.updatedAt ?? item.createdAt)}</small>
                        {!read && <i aria-label="Okunmamış" />}
                        <ChevronRight size={16} />
                      </span>
                    </button>
                  </SwipeDismissNotification>
                );
              })}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
