import { useState, type CSSProperties, type FormEvent } from 'react';
import { BookOpenText, CalendarDays } from 'lucide-react';
import MobileWheelPicker from '../../components/MobileWheelPicker';
import AppDrawer from '../../components/AppDrawer';
import GlobalPusulaBand from '../../components/GlobalPusulaBand';
import ClassicBottomNav from '../../components/ClassicBottomNav';
import WeeklyFieldPlan from '../../features/calendar/components/WeeklyFieldPlan';
import CalendarFieldNotebook from '../../features/calendar/components/CalendarFieldNotebook';
import { calendarLocalDate } from '../../features/calendar/services/weeklyFieldPlan';
import { onboardingStyles } from '../../styles/onboardingStyles';
import type {
  CalendarReminder,
  CmsBlockRow,
  CmsMenuRow,
  CmsPageRow,
  Field,
  Screen,
} from '../../types';

type Setter<T> = (value: T) => void;


const CALENDAR_COMPACT_STYLES = String.raw`
.tp-calendar-page{
  padding-top:66px!important;
}

.tp-calendar-header{
  display:none!important;
}

.tp-calendar-content{
  padding-top:8px!important;
}

.tp-calendar-hero{
  min-height:0!important;
  padding:10px 12px!important;
  gap:8px!important;
  border-radius:16px!important;
  box-shadow:none!important;
}

.tp-calendar-hero>div:first-child>span{
  font-size:7px!important;
  letter-spacing:.65px!important;
}

.tp-calendar-hero h1{
  margin:2px 0 3px!important;
  font-size:16px!important;
  line-height:1.05!important;
  letter-spacing:-.02em!important;
}

.tp-calendar-hero p{
  margin:0!important;
  font-size:8px!important;
  line-height:1.25!important;
}

.tp-calendar-summary{
  border-radius:11px!important;
}

.tp-calendar-summary>div{
  min-height:40px!important;
  padding:4px 3px!important;
}

.tp-calendar-summary strong{
  font-size:13px!important;
  line-height:1!important;
}

.tp-calendar-summary span{
  font-size:6px!important;
  line-height:1!important;
}

.tp-push-card{
  background:#fff!important;
}

.tp-push-inline-message{
  grid-column:1 / -1;
  margin-top:5px;
  padding:7px 9px;
  border:1px solid #d9dee3;
  border-radius:9px;
  background:#f7f8f9;
  color:#273039;
  font-size:8px;
  font-weight:700;
  line-height:1.35;
}

.tp-calendar-mode-switch{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:6px;
  padding:6px;
  border:1px solid #d8dde1;
  border-radius:18px;
  background:#fff;
  box-shadow:0 8px 22px rgba(15,23,42,.055);
}

.tp-calendar-mode-switch button{
  min-width:0;
  min-height:50px;
  display:flex;
  align-items:center;
  gap:9px;
  padding:7px 9px;
  border:1px solid transparent;
  border-radius:13px;
  background:#f4f6f7;
  color:#59636c;
  text-align:left;
  transition:transform .16s ease, background .16s ease, color .16s ease, border-color .16s ease;
}

.tp-calendar-mode-switch button:active{
  transform:scale(.985);
}

.tp-calendar-mode-switch button.active{
  border-color:#111315;
  background:#111315;
  color:#fff;
  box-shadow:0 5px 14px rgba(0,0,0,.16);
}

.tp-calendar-mode-icon{
  width:30px;
  height:30px;
  flex:0 0 30px;
  display:grid;
  place-items:center;
  border:1px solid #d7dde1;
  border-radius:10px;
  background:#fff;
  color:#111315;
}

.tp-calendar-mode-switch button.active .tp-calendar-mode-icon{
  border-color:rgba(255,255,255,.18);
  background:rgba(255,255,255,.11);
  color:#fff;
}

.tp-calendar-mode-copy{
  min-width:0;
  display:grid;
  gap:2px;
}

.tp-calendar-mode-copy strong{
  font-size:10px;
  font-weight:900;
  line-height:1;
  letter-spacing:-.01em;
}

.tp-calendar-mode-copy small{
  overflow:hidden;
  color:#7c858d;
  font-size:6.8px;
  font-weight:700;
  line-height:1.15;
  white-space:nowrap;
  text-overflow:ellipsis;
}

.tp-calendar-mode-switch button.active .tp-calendar-mode-copy small{
  color:rgba(255,255,255,.66);
}

@media(max-width:720px){
  .tp-calendar-content{
    padding:8px!important;
  }

  .tp-calendar-hero{
    grid-template-columns:minmax(0,1fr) 142px!important;
    align-items:center!important;
    padding:8px 9px!important;
    gap:7px!important;
  }

  .tp-calendar-hero h1{
    font-size:14px!important;
    line-height:1.04!important;
  }

  .tp-calendar-hero p{
    display:none!important;
  }

  .tp-calendar-summary>div{
    min-height:36px!important;
    padding:3px 1px!important;
  }

  .tp-calendar-summary strong{
    font-size:12px!important;
  }

  .tp-calendar-summary span{
    font-size:5.6px!important;
  }

  .tp-calendar-mode-switch{
    gap:5px!important;
    padding:5px!important;
    border-radius:16px!important;
  }

  .tp-calendar-mode-switch button{
    min-height:46px!important;
    gap:7px!important;
    padding:6px 7px!important;
  }

  .tp-calendar-mode-icon{
    width:28px!important;
    height:28px!important;
    flex-basis:28px!important;
  }

  .tp-calendar-mode-copy strong{
    font-size:9px!important;
  }

  .tp-calendar-mode-copy small{
    font-size:6px!important;
  }
}
`;

const CALENDAR_MODE_STYLES = String.raw`
/* Takvim / Tarla Defteri — independent, resilient segmented selector.
   Two adjacent choices even when CMS overrides app button typography. */
html body #root .tp-calendar-page .tp-calendar-mode-switch{
  box-sizing:border-box!important;
  display:grid!important;
  grid-template-columns:repeat(2,minmax(0,1fr))!important;
  width:100%!important;
  min-width:0!important;
  align-items:stretch!important;
  gap:8px!important;
  margin:0 0 12px!important;
  padding:6px!important;
  border:1px solid #dce2e7!important;
  border-radius:18px!important;
  background:#fff!important;
  box-shadow:0 4px 14px rgba(20,29,39,.045)!important;
}
html body #root .tp-calendar-page .tp-calendar-mode-switch > button{
  box-sizing:border-box!important;
  display:grid!important;
  grid-template-columns:28px minmax(0,1fr)!important;
  align-items:center!important;
  justify-items:stretch!important;
  column-gap:9px!important;
  width:100%!important;
  max-width:100%!important;
  min-width:0!important;
  min-height:62px!important;
  margin:0!important;
  padding:9px!important;
  border:1px solid transparent!important;
  border-radius:13px!important;
  background:#f2f4f6!important;
  color:#26313c!important;
  -webkit-text-fill-color:#26313c!important;
  text-align:left!important;
  white-space:normal!important;
}
html body #root .tp-calendar-page .tp-calendar-mode-switch > button.active{
  background:#151c24!important;
  border-color:#151c24!important;
  color:#fff!important;
  -webkit-text-fill-color:#fff!important;
}
html body #root .tp-calendar-page .tp-calendar-mode-switch .tp-calendar-mode-icon{
  box-sizing:border-box!important;
  display:grid!important;
  place-items:center!important;
  width:28px!important;
  height:28px!important;
  min-width:28px!important;
  border:1px solid #d4dce3!important;
  border-radius:9px!important;
  background:#fff!important;
  color:#26313c!important;
  -webkit-text-fill-color:#26313c!important;
}
html body #root .tp-calendar-page .tp-calendar-mode-switch > button.active .tp-calendar-mode-icon{
  border-color:rgba(255,255,255,.28)!important;
  background:rgba(255,255,255,.12)!important;
  color:#fff!important;
  -webkit-text-fill-color:#fff!important;
}
html body #root .tp-calendar-page .tp-calendar-mode-switch .tp-calendar-mode-copy{
  display:flex!important;
  flex-direction:column!important;
  align-items:flex-start!important;
  justify-content:center!important;
  gap:3px!important;
  width:100%!important;
  min-width:0!important;
}
html body #root .tp-calendar-page .tp-calendar-mode-switch .tp-calendar-mode-copy strong{
  display:block!important;
  margin:0!important;
  padding:0!important;
  max-width:100%!important;
  color:#19232e!important;
  -webkit-text-fill-color:#19232e!important;
  font-size:clamp(11px,3vw,15px)!important;
  font-weight:850!important;
  line-height:1.15!important;
  white-space:nowrap!important;
}
html body #root .tp-calendar-page .tp-calendar-mode-switch .tp-calendar-mode-copy small{
  display:-webkit-box!important;
  -webkit-box-orient:vertical!important;
  -webkit-line-clamp:2!important;
  overflow:hidden!important;
  max-width:100%!important;
  margin:0!important;
  color:#6c7781!important;
  -webkit-text-fill-color:#6c7781!important;
  font-size:clamp(8px,2.05vw,10px)!important;
  font-weight:600!important;
  line-height:1.23!important;
  white-space:normal!important;
  overflow-wrap:normal!important;
}
html body #root .tp-calendar-page .tp-calendar-mode-switch > button.active .tp-calendar-mode-copy strong{
  color:#fff!important;-webkit-text-fill-color:#fff!important;
}
html body #root .tp-calendar-page .tp-calendar-mode-switch > button.active .tp-calendar-mode-copy small{
  color:#d5dce2!important;-webkit-text-fill-color:#d5dce2!important;
}
@media(max-width:380px){
  html body #root .tp-calendar-page .tp-calendar-mode-switch{gap:5px!important;padding:5px!important}
  html body #root .tp-calendar-page .tp-calendar-mode-switch > button{
    grid-template-columns:25px minmax(0,1fr)!important;
    column-gap:6px!important;
    padding:7px 6px!important;
  }
  html body #root .tp-calendar-page .tp-calendar-mode-switch .tp-calendar-mode-icon{
    width:25px!important;height:25px!important;min-width:25px!important;
  }
}
`;

type CalendarScreenProps = {
  cmsRuntimeCss: string;
  cmsPageFor: (pageKey: string) => CmsPageRow | undefined;
  cmsBlockFor: (pageKey: string, blockKey: string) => CmsBlockRow | undefined;
  cmsMenuFor: (menuKey: string) => CmsMenuRow | undefined;
  cmsText: (block: CmsBlockRow | undefined, fallback: string) => string;
  cmsSub: (block: CmsBlockRow | undefined, fallback: string) => string;
  cmsBlockStyle: (block?: CmsBlockRow) => CSSProperties;

  calendarReminders: CalendarReminder[];
  calendarLoading: boolean;

  pushEnabled: boolean;
  pushSupported: boolean;
  pushMessage: string;
  pushLoading: boolean;

  reminderMessage: string;
  reminderFormOpen: boolean;
  reminderFieldId: string;
  reminderType: string;
  reminderTitle: string;
  reminderDate: string;
  reminderTime: string;
  reminderNotes: string;
  reminderFormLoading: boolean;

  realFields: Field[];

  setScreen: Setter<Screen>;
  setReminderFormOpen: Setter<boolean>;
  setReminderMessage: Setter<string>;
  setReminderFieldId: Setter<string>;
  setReminderType: Setter<string>;
  setReminderTitle: Setter<string>;
  setReminderDate: Setter<string>;
  setReminderTime: Setter<string>;
  setReminderNotes: Setter<string>;

  openReminderModal: (field?: Field | null) => void;
  handleAddReminder: (event: FormEvent) => void | Promise<void>;
  handleToggleReminder: (reminder: CalendarReminder) => void | Promise<void>;
  handleDeleteReminder: (id: string) => void | Promise<void>;

  enablePushNotifications: () => void | Promise<void>;
  disablePushNotifications: () => void | Promise<void>;
  sendTestPushNotification: () => void | Promise<void>;
  openAiAnalysisScreen: () => void;
  initialView?: 'calendar' | 'notebook';
};

export default function CalendarScreen({
  cmsRuntimeCss,
  cmsBlockFor,
  cmsText,
  cmsSub,
  cmsBlockStyle,
  calendarReminders,
  calendarLoading,
  pushEnabled,
  pushSupported,
  pushMessage,
  pushLoading,
  reminderMessage,
  reminderFormOpen,
  reminderFieldId,
  reminderType,
  reminderTitle,
  reminderDate,
  reminderTime,
  reminderNotes,
  reminderFormLoading,
  realFields,
  setScreen,
  setReminderFormOpen,
  setReminderMessage,
  setReminderFieldId,
  setReminderType,
  setReminderTitle,
  setReminderDate,
  setReminderTime,
  setReminderNotes,
  openReminderModal,
  handleAddReminder,
  handleToggleReminder,
  handleDeleteReminder,
  enablePushNotifications,
  disablePushNotifications,
  sendTestPushNotification,
  openAiAnalysisScreen,
  initialView = 'calendar',
}: CalendarScreenProps) {

  const calendarHeroBlock = cmsBlockFor('calendar', 'hero');
  const calendarPushBlock = cmsBlockFor('calendar', 'push-card');
  const calendarToolbarBlock = cmsBlockFor('calendar', 'toolbar');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [view, setView] = useState<'calendar' | 'notebook'>(initialView);

  const today = calendarLocalDate(new Date());
  const upcoming = calendarReminders.filter(
    (item) => !item.completed && item.reminderDate >= today,
  );
  const overdue = calendarReminders.filter(
    (item) => !item.completed && item.reminderDate < today,
  );
  const completed = calendarReminders.filter((item) => item.completed);

  const icon = (type: string) =>
    type === 'Gübreleme'
      ? '🧪'
      : type === 'İlaçlama'
        ? '🧴'
        : type === 'Sulama'
          ? '💧'
          : type === 'Hasat'
            ? '🧺'
            : type === 'Ekim / Dikim'
              ? '🌱'
              : type === 'Saha Kontrolü'
                ? '📷'
                : '🗓️';

  const card = (item: CalendarReminder) => (
    <article
      key={item.id}
      className={`tp-calendar-item ${item.completed ? 'completed' : ''}`}
    >
      <button
        className="tp-calendar-check"
        onClick={() => void handleToggleReminder(item)}
      >
        {item.completed ? '✓' : ''}
      </button>

      <div className="tp-calendar-icon">{icon(item.reminderType)}</div>

      <div className="tp-calendar-copy">
        <div className="tp-calendar-title-row">
          <strong>{item.title}</strong>
          <span>{item.reminderType}</span>
        </div>

        <p>{item.fieldName}</p>

        <div className="tp-calendar-meta">
          <span>📅 {item.reminderDate}</span>
          {item.reminderTime && <span>⏰ {item.reminderTime.slice(0, 5)}</span>}
        </div>

        {item.notes && <small>{item.notes}</small>}
      </div>

      <button
        className="tp-calendar-delete"
        onClick={() => void handleDeleteReminder(item.id)}
      >
        Sil
      </button>
    </article>
  );

  return (
    <>
      <style>{cmsRuntimeCss}</style>
      <style>{onboardingStyles}</style>
      <style>{CALENDAR_COMPACT_STYLES}</style>
      <style>{CALENDAR_MODE_STYLES}</style>

      <AppDrawer
        open={drawerOpen}
        activeScreen={'calendar' as Screen}
        onClose={() => setDrawerOpen(false)}
        onNavigate={(target, label) => {
          setDrawerOpen(false);
          setScreen(target);

          if (label === 'Tarlalarım') {
            window.setTimeout(() => {
              document
                .querySelector('.tp-home-field')
                ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
          }
        }}
      />

      <GlobalPusulaBand
        screen={view === 'notebook' ? 'fieldNotebookHub' : 'calendar'}
        title={view === 'notebook' ? 'Tarla Defteri' : 'Takvim'}
        fieldName={realFields[0]?.name ?? null}
        onBack={() => setScreen('home')}
        onMenu={() => setDrawerOpen(true)}
        onOpenAi={openAiAnalysisScreen}
      />

      <div className="tp-calendar-page">
        <header className="tp-calendar-header">
          <button onClick={() => setScreen('home')}>←</button>

          <div>
            <span>TarlaPusula</span>
            <strong>Takvim</strong>
          </div>

          <button
            className="tp-calendar-header-add"
            onClick={() => openReminderModal()}
          >
            +
          </button>
        </header>

        <main className="tp-calendar-content">
          <div className="tp-calendar-mode-switch" role="tablist" aria-label="Takvim görünümü">
            <button
              type="button"
              className={view === 'calendar' ? 'active' : ''}
              onClick={() => setView('calendar')}
              role="tab"
              aria-selected={view === 'calendar'}
            >
              <span className="tp-calendar-mode-icon"><CalendarDays size={16} /></span>
              <span className="tp-calendar-mode-copy">
                <strong>Takvim</strong>
                <small>Plan ve hatırlatmalar</small>
              </span>
            </button>

            <button
              type="button"
              className={view === 'notebook' ? 'active' : ''}
              onClick={() => setView('notebook')}
              role="tab"
              aria-selected={view === 'notebook'}
            >
              <span className="tp-calendar-mode-icon"><BookOpenText size={16} /></span>
              <span className="tp-calendar-mode-copy">
                <strong>Tarla Defteri</strong>
                <small>Gerçekleşen saha işlemleri</small>
              </span>
            </button>
          </div>

          {view === 'notebook' ? (
            <CalendarFieldNotebook fields={realFields} />
          ) : (
            <>
          <section className="tp-calendar-hero">
            <div>
              <span>{calendarHeroBlock?.icon || 'BUGÜNÜ PLANLA'}</span>
              <h1>
                {cmsText(
                  calendarHeroBlock,
                  'Tarladaki işleri zamanı gelmeden hatırla.',
                )}
              </h1>
              <p>
                {cmsSub(
                  calendarHeroBlock,
                  'Gübreleme, sulama, ilaçlama, hasat ve saha kontrollerini tarlaya bağlı olarak planlayabilirsin.',
                )}
              </p>
            </div>

            <div className="tp-calendar-summary">
              <div>
                <strong>{upcoming.length}</strong>
                <span>Yaklaşan</span>
              </div>
              <div>
                <strong>{overdue.length}</strong>
                <span>Geciken</span>
              </div>
              <div>
                <strong>{completed.length}</strong>
                <span>Tamamlanan</span>
              </div>
            </div>
          </section>

          <WeeklyFieldPlan
            reminders={calendarReminders}
            fields={realFields}
            loading={calendarLoading}
            onAdd={(date, fieldId) => {
              openReminderModal(realFields.find((field) => String(field.id) === fieldId));
              setReminderDate(date);
            }}
          />

          <section className={`tp-push-card ${pushEnabled ? 'enabled' : ''}`}>
            <div className="tp-push-icon">{pushEnabled ? '🔔' : '🔕'}</div>

            <div className="tp-push-copy">
              <span>{cmsText(calendarPushBlock, 'TELEFON BİLDİRİMLERİ')}</span>
              <strong>
                {pushEnabled
                  ? 'Hatırlatmalar telefonuna gelecek'
                  : 'Tarla işlerini telefonunda hatırla'}
              </strong>
              <p>
                {pushSupported
                  ? 'Uygulama kapalıyken bile planladığın tarla işlemleri için bildirim alabilirsin.'
                  : 'Bu tarayıcı web push bildirimlerini desteklemiyor.'}
              </p>
              {pushMessage && (
                <div className="tp-push-inline-message">{pushMessage}</div>
              )}
            </div>

            <div className="tp-push-actions">
              {pushEnabled ? (
                <>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => void sendTestPushNotification()}
                    disabled={pushLoading}
                  >
                    Test Gönder
                  </button>

                  <button
                    type="button"
                    onClick={() => void disablePushNotifications()}
                    disabled={pushLoading}
                  >
                    Kapat
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="primary"
                  onClick={() => void enablePushNotifications()}
                  disabled={pushLoading || !pushSupported}
                >
                  {pushLoading ? 'Açılıyor...' : 'Bildirimleri Aç'}
                </button>
              )}
            </div>
          </section>

          <div
            className="tp-calendar-toolbar"
            style={{ ...cmsBlockStyle(calendarToolbarBlock) }}
          >
            <div>
              <span>{calendarToolbarBlock?.icon || 'PLANLARIM'}</span>
              <strong>
                {cmsText(calendarToolbarBlock, 'Tarla görevleri')}
              </strong>
            </div>

            <button onClick={() => openReminderModal()}>
              {calendarToolbarBlock?.button_text || '+ Hatırlatma Ekle'}
            </button>
          </div>

          {calendarLoading ? (
            <div className="tp-section-loading">Takvim yükleniyor...</div>
          ) : (
            <div className="tp-calendar-groups">
              {overdue.length > 0 && (
                <section>
                  <div className="tp-calendar-group-title overdue">
                    <span>GECİKENLER</span>
                    <strong>{overdue.length} işlem</strong>
                  </div>
                  <div className="tp-calendar-list">{overdue.map(card)}</div>
                </section>
              )}

              <section>
                <div className="tp-calendar-group-title">
                  <span>YAKLAŞAN</span>
                  <strong>{upcoming.length} işlem</strong>
                </div>

                {upcoming.length ? (
                  <div className="tp-calendar-list">{upcoming.map(card)}</div>
                ) : (
                  <div className="tp-calendar-empty">
                    <div>🗓️</div>
                    <strong>Yaklaşan bir işlem yok</strong>
                    <p>Yeni bir hatırlatma ekleyerek tarla planını oluştur.</p>
                    <button onClick={() => openReminderModal()}>
                      + İlk Hatırlatmayı Ekle
                    </button>
                  </div>
                )}
              </section>

              {completed.length > 0 && (
                <section>
                  <div className="tp-calendar-group-title completed">
                    <span>TAMAMLANAN</span>
                    <strong>{completed.length} işlem</strong>
                  </div>
                  <div className="tp-calendar-list">
                    {completed.slice(0, 10).map(card)}
                  </div>
                </section>
              )}
            </div>
          )}

          {reminderMessage && !reminderFormOpen && (
            <div className="tp-field-section-message">{reminderMessage}</div>
          )}
            </>
          )}
        </main>

        {view === 'calendar' && reminderFormOpen && (
          <div
            className="tp-modal-backdrop"
            onMouseDown={() => {
              setReminderFormOpen(false);
              setReminderMessage('');
            }}
          >
            <div
              className="tp-modal-card tp-modal-card-medium"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <form
                className="tp-reminder-form tp-modal-form"
                onSubmit={handleAddReminder}
              >
                <div className="tp-production-profile-title">
                  <div>
                    <span>YENİ HATIRLATMA</span>
                    <strong>Tarla işini planla</strong>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReminderFormOpen(false)}
                  >
                    ×
                  </button>
                </div>

                <label>
                  Tarla
                  <MobileWheelPicker
                    title="Tarla seç"
                    value={reminderFieldId}
                    onChange={setReminderFieldId}
                    placeholder="Tarla seç"
                    searchable
                    options={realFields.map((field) => ({
                      value: String(field.id),
                      label: field.name,
                    }))}
                  />
                </label>

                <label>
                  İşlem türü
                  <MobileWheelPicker
                    title="İşlem türü"
                    value={reminderType}
                    onChange={setReminderType}
                    options={[
                      'Sürme',
                      'İkileme',
                      'Saha Kontrolü',
                      'Gübreleme',
                      'İlaçlama',
                      'Sulama',
                      'Ekim / Dikim',
                      'Hasat',
                      'Budama',
                      'Diğer',
                    ].map((item) => ({ value: item, label: item }))}
                  />
                </label>

                <label className="tp-reminder-full">
                  Başlık
                  <input
                    value={reminderTitle}
                    onChange={(event) => setReminderTitle(event.target.value)}
                    placeholder="Örn: 2. azot uygulaması"
                  />
                </label>

                <label>
                  Tarih
                  <input
                    type="date"
                    value={reminderDate}
                    onChange={(event) => setReminderDate(event.target.value)}
                  />
                </label>

                <label>
                  Saat (isteğe bağlı)
                  <input
                    type="time"
                    value={reminderTime}
                    onChange={(event) => setReminderTime(event.target.value)}
                  />
                </label>

                <label className="tp-reminder-full">
                  Not
                  <textarea
                    value={reminderNotes}
                    onChange={(event) => setReminderNotes(event.target.value)}
                    placeholder="İşlemle ilgili kısa not..."
                  />
                </label>

                {reminderMessage && (
                  <div className="tp-field-section-message tp-reminder-full">
                    {reminderMessage}
                  </div>
                )}

                <div className="tp-modal-actions tp-reminder-full">
                  <button
                    type="button"
                    className="tp-modal-cancel"
                    onClick={() => setReminderFormOpen(false)}
                  >
                    İptal
                  </button>

                  <button
                    type="submit"
                    className="tp-production-profile-save tp-modal-primary"
                    disabled={reminderFormLoading}
                  >
                    {reminderFormLoading
                      ? 'Kaydediliyor...'
                      : 'Hatırlatmayı Kaydet'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <ClassicBottomNav
          activeScreen="calendar"
          setScreen={setScreen}
          onOpenAi={openAiAnalysisScreen}
        />
      </div>
    </>
  );
}
