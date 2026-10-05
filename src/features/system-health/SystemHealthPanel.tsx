import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../supabaseClient';
import './SystemHealthPanel.css';

type Row = { id: string; title: string; status: string; detail: string; at: string | null; url?: string };
type Card = { id: string; title: string; status: 'connected' | 'missing' | 'error'; message: string; rows: Row[]; url: string };
type Snapshot = { checkedAt: string; cards: Card[] };
const labels = { connected: 'Veri alındı', missing: 'Bağlanmadı', error: 'Veri alınamadı' };
const formatDate = (value: string | null) => {
  const d = value ? new Date(value) : null;
  return d && Number.isFinite(d.getTime()) ? d.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }) : 'Kayıt yok';
};
function safeLink(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password &&
      ['sentry.io', 'healthchecks.io', 'console.apify.com'].includes(url.hostname) ? url.href : undefined;
  } catch { return undefined; }
}

export default function SystemHealthPanel() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(false);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refresh = useCallback(async () => {
    const id = ++generation.current;
    setLoading(true);
    setError('');
    setSnapshot(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('admin-control-center', { body: { action: 'system_health' } });
      if (invokeError || !data || !Array.isArray(data.cards) || typeof data.checkedAt !== 'string') {
        throw new Error('Sistem sağlığı bilgisi alınamadı. Oturumunuzu ve sunucu bağlantısını kontrol edin; yeni fonksiyon henüz yayınlanmamış olabilir.');
      }
      if (id === generation.current) setSnapshot(data as Snapshot);
    } catch (e) {
      if (id === generation.current) setError(e instanceof Error ? e.message : 'Durum alınamadı.');
    } finally {
      if (id === generation.current) {
        setLoading(false);
        setCooldown(true);
        timer.current = setTimeout(() => setCooldown(false), 30000);
      }
    }
  }, []);
  useEffect(() => {
    void refresh();
    return () => { generation.current++; if (timer.current) clearTimeout(timer.current); };
  }, [refresh]);

  return <div className="tp-health">
    <div className="tp-health-toolbar">
      <div><h3>Sistem Sağlığı</h3><p>Uygulama hataları ve arka plan işleri</p></div>
      <button type="button" onClick={() => void refresh()} disabled={loading || cooldown}>
        {loading ? 'Kontrol ediliyor…' : cooldown ? '30 sn bekleyin' : 'Yenile'}
      </button>
    </div>
    <p className="tp-health-note">Yalnız yöneticiler görür. Bilgiler ekran açıldığında ve Yenile ile alınır.</p>
    {loading && <p role="status">Servislerden durum bilgisi alınıyor…</p>}
    {error && <div className="tp-health-error" role="alert">{error}</div>}
    {snapshot && <>
      <p className="tp-health-time">Son kontrol: {formatDate(snapshot.checkedAt)} · Türkiye saati</p>
      {snapshot.cards.map(card => <section className="tp-health-card" key={card.id}>
        <header><h4>{card.title}</h4><span className={`tp-health-badge tp-health-badge--${card.status}`}>{labels[card.status]}</span></header>
        <p>{card.message}</p>
        {card.status === 'connected' && card.rows.length === 0 && <p className="tp-health-empty">Bu sorguda gösterilecek kayıt bulunamadı.</p>}
        <ul>{card.rows.map((row, i) => <li key={`${row.id}-${i}`}>
          <div className="tp-health-row-head"><strong>{row.title}</strong><span>{row.status}</span></div>
          <p>{row.detail}</p>
          <div className="tp-health-row-foot"><time>{formatDate(row.at)}</time>
            {row.url && safeLink(row.url) && <a href={safeLink(row.url)} target="_blank" rel="noopener noreferrer">Hata ayrıntısı ↗</a>}
          </div>
        </li>)}</ul>
        {safeLink(card.url) && <a className="tp-health-service-link" href={safeLink(card.url)} target="_blank" rel="noopener noreferrer">Servis panelini aç ↗</a>}
      </section>)}
    </>}
  </div>;
}
