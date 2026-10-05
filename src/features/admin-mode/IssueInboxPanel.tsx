import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient';
import './IssueInboxPanel.css';

type IssueStatus = 'new' | 'reviewing' | 'resolved';
type IssueCategory = 'bug' | 'suggestion' | 'content' | 'other';

type IssueReport = {
  id: string;
  user_id: string;
  user_email: string | null;
  category: IssueCategory;
  message: string;
  screen: string | null;
  page_url: string | null;
  user_agent: string | null;
  status: IssueStatus;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
  attachment_bucket: string | null;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_mime_type: string | null;
  attachment_size: number | null;
};

type Props = {
  onChanged?: () => void;
};

const STATUS_LABELS: Record<IssueStatus, string> = {
  new: 'Yeni',
  reviewing: 'İnceleniyor',
  resolved: 'Çözüldü',
};

const CATEGORY_LABELS: Record<IssueCategory, string> = {
  bug: 'Hata',
  suggestion: 'Öneri',
  content: 'İçerik',
  other: 'Diğer',
};

function dateText(value: string) {
  try {
    return new Intl.DateTimeFormat('tr-TR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'Europe/Istanbul',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function bytesText(value: number | null) {
  if (!value) return '';
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export default function IssueInboxPanel({ onChanged }: Props) {
  const [rows, setRows] = useState<IssueReport[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [filter, setFilter] = useState<'all' | IssueStatus>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [draftNote, setDraftNote] = useState('');
  const [signedUrl, setSignedUrl] = useState('');

  const load = async () => {
    setLoading(true);
    setNotice('');
    try {
      const { data, error } = await supabase
        .from('app_issue_reports')
        .select('id,user_id,user_email,category,message,screen,page_url,user_agent,status,admin_note,created_at,updated_at,attachment_bucket,attachment_path,attachment_name,attachment_mime_type,attachment_size')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      const next = (data ?? []) as IssueReport[];
      setRows(next);
      setSelectedId((current) => current && next.some((row) => row.id === current) ? current : (next[0]?.id ?? ''));
    } catch (error: any) {
      setNotice(error?.message || 'Mesaj kutusu yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener('tp:issue-report-submitted', refresh);
    return () => window.removeEventListener('tp:issue-report-submitted', refresh);
  }, []);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return rows.filter((row) => {
      if (filter !== 'all' && row.status !== filter) return false;
      if (!q) return true;
      return [row.user_email, row.message, row.screen, CATEGORY_LABELS[row.category]]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase('tr-TR').includes(q));
    });
  }, [rows, filter, search]);

  const selected =
    rows.find((row) => row.id === selectedId) ??
    filteredRows[0] ??
    null;

  useEffect(() => {
    setDraftNote(selected?.admin_note ?? '');
    setSignedUrl('');

    if (!selected?.attachment_path) return;

    let alive = true;
    void (async () => {
      const bucket = selected.attachment_bucket || 'issue-report-attachments';
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(selected.attachment_path as string, 3600);

      if (!alive) return;
      if (error) {
        setNotice(error.message);
        return;
      }
      setSignedUrl(data.signedUrl);
    })();

    return () => {
      alive = false;
    };
  }, [selected?.id, selected?.attachment_path, selected?.attachment_bucket]);

  const save = async (status: IssueStatus = selected?.status ?? 'new') => {
    if (!selected) return;
    setSaving(true);
    setNotice('');
    try {
      const { data, error } = await supabase
        .from('app_issue_reports')
        .update({
          status,
          admin_note: draftNote.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selected.id)
        .select('id,status,admin_note,updated_at')
        .single();

      if (error) throw error;

      setRows((current) =>
        current.map((row) =>
          row.id === selected.id
            ? {
                ...row,
                status: data.status as IssueStatus,
                admin_note: data.admin_note,
                updated_at: data.updated_at,
              }
            : row,
        ),
      );
      setNotice('Mesaj güncellendi.');
      onChanged?.();
    } catch (error: any) {
      setNotice(error?.message || 'Mesaj güncellenemedi.');
    } finally {
      setSaving(false);
    }
  };

  const counts = useMemo(() => ({
    all: rows.length,
    new: rows.filter((row) => row.status === 'new').length,
    reviewing: rows.filter((row) => row.status === 'reviewing').length,
    resolved: rows.filter((row) => row.status === 'resolved').length,
  }), [rows]);

  return (
    <div className="tp-issue-inbox">
      <div className="tp-issue-inbox-toolbar">
        <div>
          <h3>Mesaj Kutusu</h3>
          <p>Kullanıcıların hata bildirimleri, önerileri ve ekran görüntüleri.</p>
        </div>
        <button type="button" disabled={loading} onClick={() => void load()}>
          {loading ? 'Yükleniyor…' : 'Yenile'}
        </button>
      </div>

      <div className="tp-issue-inbox-filters">
        {(['all', 'new', 'reviewing', 'resolved'] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={filter === value ? 'active' : ''}
            onClick={() => setFilter(value)}
          >
            {value === 'all' ? 'Tümü' : STATUS_LABELS[value]} <b>{counts[value]}</b>
          </button>
        ))}
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Mesaj, ekran veya e-posta ara…"
        />
      </div>

      {notice && <div className="tp-issue-inbox-notice" role="status">{notice}</div>}

      <div className="tp-issue-inbox-layout">
        <div className="tp-issue-inbox-list">
          {!loading && !filteredRows.length && (
            <div className="tp-issue-inbox-empty">Bu filtrede mesaj yok.</div>
          )}

          {filteredRows.map((row) => (
            <button
              type="button"
              key={row.id}
              className={row.id === selected?.id ? 'active' : ''}
              onClick={() => setSelectedId(row.id)}
            >
              <div className="tp-issue-inbox-list-top">
                <span className={`status status--${row.status}`}>{STATUS_LABELS[row.status]}</span>
                <time>{dateText(row.created_at)}</time>
              </div>
              <strong>{CATEGORY_LABELS[row.category]} · {row.screen || 'Ekran bilgisi yok'}</strong>
              <p>{row.message}</p>
              <small>{row.user_email || 'E-posta yok'}{row.attachment_path ? ' · Ekran görüntüsü var' : ''}</small>
            </button>
          ))}
        </div>

        <div className="tp-issue-inbox-detail">
          {!selected ? (
            <div className="tp-issue-inbox-empty">Okumak için bir mesaj seç.</div>
          ) : (
            <>
              <header>
                <div>
                  <small>{CATEGORY_LABELS[selected.category]} · {STATUS_LABELS[selected.status]}</small>
                  <h4>{selected.user_email || 'Kullanıcı'}</h4>
                  <p>{dateText(selected.created_at)} · {selected.screen || 'Ekran bilgisi yok'}</p>
                </div>
              </header>

              <section className="tp-issue-inbox-message">
                <strong>Kullanıcı mesajı</strong>
                <p>{selected.message}</p>
              </section>

              {selected.attachment_path && (
                <section className="tp-issue-inbox-attachment">
                  <div>
                    <strong>Ekran görüntüsü</strong>
                    <span>{selected.attachment_name || 'görsel'} {bytesText(selected.attachment_size)}</span>
                  </div>
                  {signedUrl ? (
                    <a href={signedUrl} target="_blank" rel="noreferrer">
                      <img src={signedUrl} alt="Kullanıcının eklediği ekran görüntüsü" />
                    </a>
                  ) : (
                    <div className="tp-issue-inbox-image-loading">Görsel hazırlanıyor…</div>
                  )}
                </section>
              )}

              <section className="tp-issue-inbox-meta">
                <div><span>Ekran</span><b>{selected.screen || '—'}</b></div>
                <div><span>Sayfa</span><b>{selected.page_url || '—'}</b></div>
              </section>

              <label className="tp-issue-inbox-note">
                <span>Admin notu</span>
                <textarea
                  rows={4}
                  value={draftNote}
                  onChange={(event) => setDraftNote(event.target.value)}
                  placeholder="İnceleme notu, yapılan düzeltme veya takip bilgisi…"
                />
              </label>

              <div className="tp-issue-inbox-actions">
                <button type="button" disabled={saving} onClick={() => void save('new')}>Yeni</button>
                <button type="button" disabled={saving} onClick={() => void save('reviewing')}>İnceleniyor</button>
                <button type="button" className="primary" disabled={saving} onClick={() => void save('resolved')}>Çözüldü</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
