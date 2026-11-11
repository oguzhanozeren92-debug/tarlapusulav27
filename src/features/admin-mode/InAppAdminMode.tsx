import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { useAdminRole } from '../app-shell/hooks/useAdminRole';
import ContentAdminPanel from '../content-admin/ContentAdminPanel';
import SystemHealthPanel from '../system-health/SystemHealthPanel';
import IssueInboxPanel from './IssueInboxPanel';
import {
  fetchAdminAudit,
  fetchAdminOverview,
  fetchAdminUserDetail,
  sendAdminBroadcast,
  type AdminAuditRow,
  type AdminMetrics,
  type AdminOverviewResponse,
  type AdminUserDetailResponse,
  type AdminUserSummary,
} from './adminControl.service';
import './InAppAdminMode.css';

type Panel = 'overview' | 'content' | 'system' | 'issues' | 'users' | 'broadcast' | 'audit';

const EMPTY_METRICS: AdminMetrics = {
  users: 0,
  active_7d: 0,
  active_30d: 0,
  fields: 0,
  total_decare: 0,
  active_push_users: 0,
  pending_content: 0,
  published_content: 0,
  active_sources: 0,
  notifications: 0,
};

function dateText(value: string | null | undefined) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return value;
  }
}

function numberText(value: number | null | undefined, digits = 0) {
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: digits }).format(Number(value || 0));
}

export default function InAppAdminMode() {
  const isAdmin = useAdminRole();
  const [modeOpen, setModeOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>('overview');
  const [sheetCollapsed, setSheetCollapsed] = useState(false);
  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [issueNewCount, setIssueNewCount] = useState(0);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<AdminUserSummary | null>(null);
  const [userDetail, setUserDetail] = useState<AdminUserDetailResponse | null>(null);
  const [userLoading, setUserLoading] = useState(false);
  const [auditRows, setAuditRows] = useState<AdminAuditRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastAudience, setBroadcastAudience] = useState<'all' | 'plan' | 'crop' | 'selected'>('all');
  const [broadcastPlan, setBroadcastPlan] = useState('free');
  const [broadcastCrop, setBroadcastCrop] = useState('');
  const [broadcastSelected, setBroadcastSelected] = useState<string[]>([]);
  const [broadcastBusy, setBroadcastBusy] = useState(false);

  useEffect(() => {
    if (!isAdmin) {
      setModeOpen(false);
      return;
    }
    try {
      if (window.localStorage.getItem('tp_admin_mode_open_v1') === '1') setModeOpen(true);
    } catch {
      // ignored
    }
  }, [isAdmin]);

  const setOpen = (value: boolean) => {
    setModeOpen(value);
    try {
      window.localStorage.setItem('tp_admin_mode_open_v1', value ? '1' : '0');
    } catch {
      // ignored
    }
  };

  const loadIssueCount = async () => {
    const { count, error } = await supabase
      .from('app_issue_reports')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'new');

    if (!error) setIssueNewCount(count ?? 0);
  };

  const loadOverview = async () => {
    setOverviewLoading(true);
    setMessage('');
    try {
      setOverview(await fetchAdminOverview());
    } catch (error: any) {
      setMessage(error?.message || 'Yönetim özeti alınamadı.');
    } finally {
      setOverviewLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin && modeOpen) {
      void loadOverview();
      void loadIssueCount();
    }
  }, [isAdmin, modeOpen]);

  const filteredUsers = useMemo(() => {
    const value = search.trim().toLocaleLowerCase('tr-TR');
    const rows = overview?.users ?? [];
    if (!value) return rows;
    return rows.filter((user) =>
      [user.full_name, user.username, user.email, user.subscription_plan, ...(user.crops || [])]
        .filter(Boolean)
        .some((item) => String(item).toLocaleLowerCase('tr-TR').includes(value)),
    );
  }, [overview, search]);

  const openUser = async (user: AdminUserSummary) => {
    setSelectedUser(user);
    setUserDetail(null);
    setUserLoading(true);
    setMessage('');
    try {
      setUserDetail(await fetchAdminUserDetail(user.id));
    } catch (error: any) {
      setMessage(error?.message || 'Kullanıcı profili alınamadı.');
    } finally {
      setUserLoading(false);
    }
  };

  const loadAudit = async () => {
    setAuditLoading(true);
    setMessage('');
    try {
      const data = await fetchAdminAudit(120);
      setAuditRows(data.rows ?? []);
    } catch (error: any) {
      setMessage(error?.message || 'İşlem geçmişi alınamadı.');
    } finally {
      setAuditLoading(false);
    }
  };

  const changePanel = (next: Panel) => {
    setPanel(next);
    setSheetCollapsed(false);
    setMessage('');
    if (next === 'audit') void loadAudit();
    if (next === 'issues') void loadIssueCount();
    if (next === 'users' && !overview) void loadOverview();
  };

  const sendBroadcast = async () => {
    if (!broadcastTitle.trim() || !broadcastMessage.trim()) {
      setMessage('Başlık ve mesaj gerekli.');
      return;
    }
    if (broadcastAudience === 'selected' && !broadcastSelected.length) {
      setMessage('En az bir kullanıcı seç.');
      return;
    }
    if (broadcastAudience === 'all' && !window.confirm('Bu bildirimi tüm kullanıcılara göndereyim mi?')) return;

    setBroadcastBusy(true);
    setMessage('Bildirim hazırlanıyor…');
    try {
      const result = await sendAdminBroadcast({
        title: broadcastTitle.trim(),
        message: broadcastMessage.trim(),
        target: 'notificationsHub',
        severity: 'info',
        audience: broadcastAudience,
        plan: broadcastPlan,
        crop: broadcastCrop.trim(),
        user_ids: broadcastSelected,
      });
      setMessage(`${result.recipients} kullanıcıya uygulama bildirimi oluşturuldu. Push: ${result.push_sent} başarılı, ${result.push_failed} başarısız.`);
      setBroadcastTitle('');
      setBroadcastMessage('');
      await loadOverview();
    } catch (error: any) {
      setMessage(error?.message || 'Bildirim gönderilemedi.');
    } finally {
      setBroadcastBusy(false);
    }
  };

  if (!isAdmin) return null;

  if (!modeOpen) {
    return (
      <button data-tp-admin-ui="1" className="tp-admin-entry" type="button" onClick={() => setOpen(true)}>
        <span>◆</span> Admin Modu
      </button>
    );
  }

  const metrics = overview?.metrics ?? EMPTY_METRICS;
  const panelTitle =
    panel === 'overview' ? 'Yönetim özeti' :
    panel === 'content' ? 'Haber akışı' :
    panel === 'system' ? 'Sistem sağlığı' :
    panel === 'issues' ? 'Mesaj Kutusu' :
    panel === 'users' ? 'Kullanıcılar' :
    panel === 'broadcast' ? 'Bildirim gönder' :
    'Değişiklik geçmişi';

  return (
    <div data-tp-admin-ui="1" className="tp-admin-mode-root">
      <div className="tp-admin-dock">
        <button className={panel === 'overview' ? 'active' : ''} onClick={() => changePanel('overview')}><b>◆</b><span>Özet</span></button>
        <button className={panel === 'content' ? 'active' : ''} onClick={() => changePanel('content')}><b>▤</b><span>Haber</span></button>
        <button className={panel === 'system' ? 'active' : ''} onClick={() => changePanel('system')}><b>⌁</b><span>Sistem</span></button>
        <button className={panel === 'issues' ? 'active' : ''} onClick={() => changePanel('issues')}><b>✉</b><span>Mesaj{issueNewCount ? ` (${issueNewCount})` : ''}</span></button>
        <button className={panel === 'users' ? 'active' : ''} onClick={() => changePanel('users')}><b>◎</b><span>Kullanıcı</span></button>
        <button className={panel === 'broadcast' ? 'active' : ''} onClick={() => changePanel('broadcast')}><b>⌁</b><span>Bildirim</span></button>
        <button className={panel === 'audit' ? 'active' : ''} onClick={() => changePanel('audit')}><b>↺</b><span>Geçmiş</span></button>
        <button className="tp-admin-dock-close" onClick={() => setOpen(false)}><b>×</b><span>Kapat</span></button>
      </div>

      <section className={`tp-admin-sheet tp-admin-sheet--${panel}${sheetCollapsed ? ' is-collapsed' : ''}`}>
        <header className="tp-admin-sheet-head">
          <div>
            <small>TarlaPusula · ADMIN MODU</small>
            <h2>{panelTitle}</h2>
          </div>
          <button type="button" aria-label={sheetCollapsed ? 'Yönetim panelini aç' : 'Yönetim panelini daralt'} title={sheetCollapsed ? 'Paneli aç' : 'Paneli daralt'} onClick={() => setSheetCollapsed((value) => !value)}>{sheetCollapsed ? '⌃' : '⌄'}</button>
        </header>

        {message && <div className="tp-admin-message">{message}</div>}

        {panel === 'overview' && (
          <div className="tp-admin-overview">
            <div className="tp-admin-metrics">
              <article><strong>{numberText(metrics.users)}</strong><span>Kullanıcı</span></article>
              <article><strong>{numberText(metrics.active_7d)}</strong><span>7 gün aktif</span></article>
              <article><strong>{numberText(metrics.fields)}</strong><span>Tarla</span></article>
              <article><strong>{numberText(metrics.total_decare, 1)}</strong><span>Toplam dekar</span></article>
              <article><strong>{numberText(metrics.pending_content)}</strong><span>Onay bekleyen</span></article>
              <article><strong>{numberText(metrics.active_push_users)}</strong><span>Push açık</span></article>
            </div>
            <div className="tp-admin-quick-grid">
              <button onClick={() => changePanel('content')}><b>▤</b><span>Haber akışını yönet</span><small>Adaylar · yayınlananlar · kaynaklar</small></button>
              <button onClick={() => changePanel('issues')}><b>✉</b><span>Mesaj Kutusunu aç</span><small>{issueNewCount ? `${issueNewCount} yeni kullanıcı mesajı` : 'Hata bildirimleri · öneriler · ekran görüntüleri'}</small></button>
              <button onClick={() => changePanel('users')}><b>◎</b><span>Kullanıcıları gör</span><small>Tarla · ürün · faaliyet · puan</small></button>
              <button onClick={() => changePanel('broadcast')}><b>⌁</b><span>Bildirim gönder</span><small>Herkese veya seçili gruba</small></button>
            </div>
            <button className="tp-admin-refresh" disabled={overviewLoading} onClick={() => void loadOverview()}>{overviewLoading ? 'Yenileniyor…' : 'Verileri yenile'}</button>
          </div>
        )}

        {panel === 'content' && <div className="tp-admin-content-wrap"><ContentAdminPanel /></div>}

        {panel === 'system' && <div className="tp-admin-content-wrap"><SystemHealthPanel /></div>}

        {panel === 'issues' && <div className="tp-admin-content-wrap"><IssueInboxPanel onChanged={() => void loadIssueCount()} /></div>}

        {panel === 'users' && (
          <div className="tp-admin-users">
            {selectedUser ? (
              <div className="tp-admin-user-detail">
                <button className="tp-admin-back" onClick={() => { setSelectedUser(null); setUserDetail(null); }}>← Kullanıcılara dön</button>
                <div className="tp-admin-user-hero"><div><small>KULLANICI PROFİLİ</small><h3>{selectedUser.full_name || selectedUser.username || selectedUser.email || 'Kullanıcı'}</h3><p>{selectedUser.email || 'E-posta yok'} · {selectedUser.subscription_plan.toUpperCase()}</p></div><strong>{selectedUser.field_count} tarla</strong></div>
                {userLoading && <div className="tp-admin-loading-line">Profil yükleniyor…</div>}
                {userDetail && (
                  <>
                    <div className="tp-admin-profile-metrics"><article><strong>{numberText(selectedUser.total_decare, 1)}</strong><span>dekar</span></article><article><strong>{numberText(selectedUser.points)}</strong><span>puan</span></article><article><strong>{userDetail.activities.length}</strong><span>son faaliyet</span></article><article><strong>{userDetail.todos.filter((todo:any)=>!todo.completed&&!todo.dismissed).length}</strong><span>açık görev</span></article></div>
                    <section><h4>Tarlaları</h4><div className="tp-admin-detail-list">{userDetail.fields.length ? userDetail.fields.map((field:any)=><article key={field.id}><div><strong>{field.name || 'Tarla'}</strong><span>{field.crop || 'Ürün yok'} · {field.city || '—'} {field.district || ''}</span></div><b>{numberText(field.area_decare,1)} da</b></article>) : <p>Tarla kaydı yok.</p>}</div></section>
                    <section><h4>Son işlemleri</h4><div className="tp-admin-detail-list">{userDetail.activities.length ? userDetail.activities.slice(0,20).map((activity:any)=><article key={activity.id}><div><strong>{activity.title || activity.activity_type || 'İşlem'}</strong><span>{activity.product_name || activity.notes || 'Detay yok'}</span></div><b>{activity.activity_date || dateText(activity.created_at)}</b></article>) : <p>İşlem kaydı yok.</p>}</div></section>
                    <section><h4>Görev ve hatırlatmalar</h4><div className="tp-admin-detail-list">{[...userDetail.todos.slice(0,10),...userDetail.reminders.slice(0,10)].length ? [...userDetail.todos.slice(0,10),...userDetail.reminders.slice(0,10)].map((item:any,index)=><article key={item.id || index}><div><strong>{item.title || item.reminder_type || 'Kayıt'}</strong><span>{item.description || item.notes || (item.completed ? 'Tamamlandı' : 'Açık')}</span></div><b>{item.due_date || item.reminder_date || ''}</b></article>) : <p>Görev/hatırlatma yok.</p>}</div></section>
                  </>
                )}
              </div>
            ) : (
              <>
                <div className="tp-admin-user-tools"><input value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="İsim, e-posta, ürün veya plan ara…" /><button onClick={() => void loadOverview()}>{overviewLoading ? '…' : 'Yenile'}</button></div>
                <div className="tp-admin-user-list">
                  {filteredUsers.map((user) => <button key={user.id} onClick={() => void openUser(user)}><div><strong>{user.full_name || user.username || user.email || 'Kullanıcı'}</strong><span>{user.email || 'E-posta yok'} · {user.subscription_plan.toUpperCase()}</span><small>{user.crops.length ? user.crops.join(', ') : 'Henüz ürün yok'} · Son giriş {dateText(user.last_sign_in_at)}</small></div><aside><b>{user.field_count}</b><span>tarla</span></aside></button>)}
                  {!overviewLoading && !filteredUsers.length && <div className="tp-admin-empty-inline">Kullanıcı bulunamadı.</div>}
                </div>
              </>
            )}
          </div>
        )}

        {panel === 'broadcast' && (
          <div className="tp-admin-broadcast">
            <div className="tp-admin-choice-block"><span>Kime?</span><div>{(['all','plan','crop','selected'] as const).map((value)=><button key={value} className={broadcastAudience===value?'active':''} onClick={()=>setBroadcastAudience(value)}>{value==='all'?'Herkese':value==='plan'?'Plana göre':value==='crop'?'Ürüne göre':'Kullanıcı seç'}</button>)}</div></div>
            {broadcastAudience === 'plan' && <label className="tp-admin-field">Plan<select value={broadcastPlan} onChange={(event)=>setBroadcastPlan(event.target.value)}><option value="free">Free</option><option value="plus">Plus</option><option value="premium">Premium</option></select></label>}
            {broadcastAudience === 'crop' && <label className="tp-admin-field">Ürün<input value={broadcastCrop} onChange={(event)=>setBroadcastCrop(event.target.value)} placeholder="Örn. Buğday" /></label>}
            {broadcastAudience === 'selected' && <div className="tp-admin-broadcast-users">{(overview?.users ?? []).map((user)=><label key={user.id}><input type="checkbox" checked={broadcastSelected.includes(user.id)} onChange={(event)=>setBroadcastSelected((current)=>event.target.checked?[...current,user.id]:current.filter((id)=>id!==user.id))}/><span>{user.full_name || user.username || user.email || 'Kullanıcı'}</span></label>)}</div>}
            <label className="tp-admin-field">Başlık<input value={broadcastTitle} onChange={(event)=>setBroadcastTitle(event.target.value)} placeholder="Bildirim başlığı" /></label>
            <label className="tp-admin-field">Mesaj<textarea value={broadcastMessage} onChange={(event)=>setBroadcastMessage(event.target.value)} rows={5} placeholder="Kullanıcıların göreceği mesaj…" /></label>
            <button className="tp-admin-send" disabled={broadcastBusy} onClick={() => void sendBroadcast()}>{broadcastBusy ? 'Gönderiliyor…' : 'Bildirimi gönder'}</button>
            <p className="tp-admin-help">Bildirim uygulama içindeki Bildirimler ekranına düşer; push izni olan cihazlara ayrıca push gönderilir.</p>
          </div>
        )}

        {panel === 'audit' && (
          <div className="tp-admin-audit">
            <button className="tp-admin-refresh" disabled={auditLoading} onClick={() => void loadAudit()}>{auditLoading ? 'Yükleniyor…' : 'Geçmişi yenile'}</button>
            <div className="tp-admin-audit-list">{auditRows.map((row)=><article key={row.id}><div><strong>{row.action.replaceAll('_',' ')}</strong><span>{row.target_type || 'sistem'} · {row.target_id || '—'}</span></div><time>{dateText(row.created_at)}</time></article>)}{!auditLoading&&!auditRows.length&&<p>Henüz admin işlemi kaydı yok.</p>}</div>
          </div>
        )}
      </section>
    </div>
  );
}
