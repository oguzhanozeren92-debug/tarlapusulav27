import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BookOpen,
  Calculator,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Globe2,
  MapPinned,
  Newspaper,
  RefreshCw,
  Star,
  X,
} from 'lucide-react';
import { supabase } from '../../supabaseClient';
import './PublishedAgriNewsBridge.css';

type ContentTab = 'turkey' | 'world' | 'articles';

type SourceRef = {
  source_name?: unknown;
  url?: unknown;
  title?: unknown;
  published_at?: unknown;
};

type ChartData = {
  title?: string | null;
  type?: 'bar' | 'line' | string | null;
  labels?: string[] | null;
  values?: number[] | null;
  unit?: string | null;
};

type TableData = {
  title?: string | null;
  columns?: string[] | null;
  rows?: Array<Array<string | number | null>> | null;
};

type DetailBlock = {
  lead?: string | null;
  what_happened?: string | null;
  where_when?: string | null;
  background?: string | null;
  why_it_matters?: string | null;
  producer_impact?: string | null;
  market_impact?: string | null;
  source_note?: string | null;
};

type StructuredBody = {
  detail?: DetailBlock | null;
  problem?: string | null;
  findings?: string[] | null;
  practical_takeaway?: string | null;
  chart_data?: ChartData | null;
  table_data?: TableData | null;
};

type R2Payload = {
  title?: string;
  summary?: string;
  coverage?: {
    scope?: 'turkey' | 'world';
    country_code?: string | null;
    country_name?: string | null;
    location?: string | null;
    event_date?: string | null;
  };
  category?: string;
  tags?: string[];
  crops?: string[];
  detail?: DetailBlock;
  findings?: string[];
  practical_takeaway?: string;
  chart_data?: ChartData | null;
  table_data?: TableData | null;
  source?: {
    name?: string | null;
    url?: string | null;
    title?: string | null;
    published_at?: string | null;
    doi?: string | null;
    author?: string | null;
    institution?: string | null;
  };
};

type LiveContentRow = {
  id: string;
  content_type: 'news' | 'knowledge';
  content_subtype: string | null;
  title: string;
  excerpt: string | null;
  body: string;
  structured_body: StructuredBody | null;
  category: string | null;
  tags: string[] | null;
  crop_tags: string[] | null;
  source_refs: SourceRef[] | null;
  doi_number: string | null;
  author_text: string | null;
  institution_text: string | null;
  reading_time_minutes: number | null;
  published_at: string | null;
  updated_at: string;
  views_count: number;
  rating_sum: number;
  rating_count: number;
  average_rating: number | string;
  coverage_scope: 'turkey' | 'world' | null;
  country_code: string | null;
  country_name: string | null;
  location_text: string | null;
  event_date: string | null;
  payload_public_url: string | null;
  payload_status: string | null;
  image_status: string | null;
};

type ImageRow = {
  content_id: string | null;
  public_url: string | null;
  original_url: string | null;
  credit_text: string | null;
  is_cover: boolean;
};

type RatingRow = {
  content_id: string;
  rating: number;
};

const DEFAULT_READ_MINUTES = 3;

function safeArray<T>(value: T[] | null | undefined) {
  return Array.isArray(value) ? value : [];
}

function fmtDate(value: string | null | undefined) {
  if (!value) return 'Tarih belirtilmedi';
  try {
    return new Intl.DateTimeFormat('tr-TR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sourceName(item: LiveContentRow) {
  const value = item.source_refs?.[0]?.source_name;
  return typeof value === 'string' && value.trim()
    ? value
    : item.institution_text || 'TarlaPusula kaynak ağı';
}

function sourceUrl(item: LiveContentRow) {
  const value = item.source_refs?.[0]?.url;
  return typeof value === 'string' ? value : '';
}

function doiUrl(doi: string | null) {
  if (!doi) return '';
  const normalized = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').trim();
  return normalized ? `https://doi.org/${normalized}` : '';
}

function categoryLabel(item: LiveContentRow) {
  if (item.category?.trim()) return item.category;
  return item.content_subtype === 'article' ? 'Araştırma' : 'Tarım Gündemi';
}

function readTime(item: LiveContentRow) {
  if (item.reading_time_minutes && item.reading_time_minutes > 0) return item.reading_time_minutes;
  const words = `${item.excerpt ?? ''} ${item.body ?? ''}`.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 210)) || DEFAULT_READ_MINUTES;
}

function chartRows(chart: ChartData | null | undefined) {
  const labels = safeArray(chart?.labels);
  const values = safeArray(chart?.values).map(Number);
  if (!labels.length || labels.length !== values.length || values.some((value) => !Number.isFinite(value))) return [];
  return labels.map((label, index) => ({ label, value: values[index] }));
}

function ArticleChart({ chart }: { chart: ChartData }) {
  const rows = chartRows(chart);
  if (!rows.length) return null;
  const isLine = chart.type === 'line';
  return (
    <section className="tp-content-chart">
      <header><span>ARAŞTIRMA VERİSİ</span><strong>{chart.title || 'Sayısal karşılaştırma'}</strong></header>
      <div className="tp-content-chart__canvas">
        <ResponsiveContainer width="100%" height="100%">
          {isLine ? (
            <LineChart data={rows} margin={{ top: 10, right: 12, bottom: 8, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(value) => [`${value}${chart.unit ? ` ${chart.unit}` : ''}`, 'Değer']} />
              <Line type="monotone" dataKey="value" stroke="currentColor" strokeWidth={2.2} dot={{ r: 3 }} />
            </LineChart>
          ) : (
            <BarChart data={rows} margin={{ top: 10, right: 12, bottom: 8, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(value) => [`${value}${chart.unit ? ` ${chart.unit}` : ''}`, 'Değer']} />
              <Bar dataKey="value" fill="currentColor" radius={[6, 6, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function ArticleTable({ table }: { table: TableData }) {
  const columns = safeArray(table.columns);
  const rows = safeArray(table.rows);
  if (!columns.length || !rows.length) return null;
  return (
    <section className="tp-content-table-card">
      {table.title ? <strong>{table.title}</strong> : null}
      <div className="tp-content-table-scroll">
        <table>
          <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`${rowIndex}-${row.join('-')}`}>
                {columns.map((_, columnIndex) => <td key={columnIndex}>{String(row[columnIndex] ?? '—')}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ContentImage({ image, className = '', alt = '' }: { image?: ImageRow; className?: string; alt?: string }) {
  const primary = image?.public_url?.trim() || '';
  const fallback = image?.original_url?.trim() || '';
  const [src, setSrc] = useState(primary || fallback);

  useEffect(() => {
    setSrc(primary || fallback);
  }, [primary, fallback]);

  if (!src) {
    return (
      <div className={`${className} tp-content-image-fallback`} aria-label="İçerik görseli hazırlanıyor">
        <Newspaper size={24} />
        <span>TarlaPusula</span>
      </div>
    );
  }

  return (
    <img
      className={className || undefined}
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => {
        if (src === primary && fallback && fallback !== primary) {
          setSrc(fallback);
          return;
        }
        setSrc('');
      }}
    />
  );
}

function RatingStars({ value, average, count, disabled, onRate }: {
  value: number;
  average: number;
  count: number;
  disabled?: boolean;
  onRate: (rating: number) => void;
}) {
  return (
    <div className="tp-rating" onClick={(event) => event.stopPropagation()}>
      <div>
        {[1, 2, 3, 4, 5].map((star) => (
          <button type="button" key={star} disabled={disabled} onClick={() => onRate(star)} aria-label={`${star} yıldız ver`}>
            <Star size={17} fill={star <= value ? 'currentColor' : 'none'} />
          </button>
        ))}
      </div>
      <span>{count > 0 ? `${average.toFixed(1)} · ${count} oy` : 'Henüz puan yok'}</span>
    </div>
  );
}

export default function PublishedAgriNewsBridge({ onOpenSupport }: { onOpenSupport?: () => void }) {
  const [activeTab, setActiveTab] = useState<ContentTab>('turkey');
  const [news, setNews] = useState<LiveContentRow[]>([]);
  const [articles, setArticles] = useState<LiveContentRow[]>([]);
  const [images, setImages] = useState<Record<string, ImageRow>>({});
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [authUserId, setAuthUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<LiveContentRow | null>(null);
  const [detailPayload, setDetailPayload] = useState<R2Payload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [ratingBusyId, setRatingBusyId] = useState('');
  const railRef = useRef<HTMLDivElement | null>(null);

  const loadPublished = async () => {
    setLoading(true);
    setError('');
    try {
      const columns = [
        'id','content_type','content_subtype','title','excerpt','body','structured_body','category','tags','crop_tags','source_refs',
        'doi_number','author_text','institution_text','reading_time_minutes','published_at','updated_at','views_count','rating_sum','rating_count','average_rating',
        'coverage_scope','country_code','country_name','location_text','event_date','payload_public_url','payload_status','image_status',
      ].join(',');

      const [newsResult, articleResult, authResult] = await Promise.all([
        supabase.from('content_items').select(columns).eq('status', 'published').eq('content_type', 'news').order('published_at', { ascending: false }).limit(60),
        supabase.from('content_items').select(columns).eq('status', 'published').eq('content_subtype', 'article').order('published_at', { ascending: false }).limit(60),
        supabase.auth.getUser(),
      ]);

      if (newsResult.error) throw newsResult.error;
      if (articleResult.error) throw articleResult.error;

      const nextNews = (newsResult.data ?? []) as LiveContentRow[];
      const nextArticles = (articleResult.data ?? []) as LiveContentRow[];
      setNews(nextNews);
      setArticles(nextArticles);

      const ids = [...new Set([...nextNews, ...nextArticles].map((item) => item.id))];
      if (ids.length) {
        const imageResult = await supabase
          .from('content_images')
          .select('content_id,public_url,original_url,credit_text,is_cover')
          .in('content_id', ids)
          .eq('status', 'approved')
          .order('is_cover', { ascending: false });
        if (imageResult.error) throw imageResult.error;
        const imageMap: Record<string, ImageRow> = {};
        ((imageResult.data ?? []) as ImageRow[]).forEach((image) => {
          if (!image.content_id || imageMap[image.content_id]) return;
          imageMap[image.content_id] = image;
        });
        setImages(imageMap);
      } else {
        setImages({});
      }

      const userId = authResult.data.user?.id ?? '';
      setAuthUserId(userId);
      if (userId && nextArticles.length) {
        const ratingResult = await supabase.from('content_ratings').select('content_id,rating').in('content_id', nextArticles.map((item) => item.id));
        if (!ratingResult.error) {
          const nextRatings: Record<string, number> = {};
          ((ratingResult.data ?? []) as RatingRow[]).forEach((row) => { nextRatings[row.content_id] = row.rating; });
          setRatings(nextRatings);
        }
      } else {
        setRatings({});
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Tarım Gündemi yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadPublished(); }, []);

  const turkeyNews = useMemo(() => news.filter((item) => item.coverage_scope !== 'world'), [news]);
  const worldNews = useMemo(() => news.filter((item) => item.coverage_scope === 'world'), [news]);
  const visibleNews = activeTab === 'world' ? worldNews : turkeyNews;

  const openDetail = async (item: LiveContentRow) => {
    setDetail(item);
    setDetailPayload(null);
    setDetailLoading(true);
    try {
      if (item.payload_public_url && item.payload_status === 'ready') {
        const response = await fetch(item.payload_public_url, { headers: { Accept: 'application/json' } });
        if (response.ok) setDetailPayload(await response.json());
      }
      if (authUserId) void supabase.rpc('content_record_view', { p_content_id: item.id });
    } catch {
      // R2 paketi açılamazsa Supabase önizleme alanlarıyla devam edilir.
    } finally {
      setDetailLoading(false);
    }
  };

  const rateArticle = async (contentId: string, rating: number) => {
    if (!authUserId) { setError('Makale puanlamak için giriş yapmalısın.'); return; }
    setRatingBusyId(contentId);
    try {
      const { error: ratingError } = await supabase.from('content_ratings').upsert({ content_id: contentId, user_id: authUserId, rating, updated_at: new Date().toISOString() }, { onConflict: 'content_id,user_id' });
      if (ratingError) throw ratingError;
      setRatings((current) => ({ ...current, [contentId]: rating }));
      await loadPublished();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Puan kaydedilemedi.');
    } finally {
      setRatingBusyId('');
    }
  };

  const scrollRail = (direction: -1 | 1) => {
    const node = railRef.current;
    if (!node) return;
    node.scrollBy({ left: direction * Math.max(280, node.clientWidth * 0.86), behavior: 'smooth' });
  };

  const feed = (
    <section className="tp-content-hub" aria-label="Tarım Gündemi">
      <header className="tp-content-hub__header tp-content-hub__header--clean">
        <div>
          <span>GÜNCEL · SADE · ÜRETİCİ ODAKLI</span>
          <h2>Tarım Gündemi</h2>
          <p>Tarlana, ürününe ve tarıma dair önemli gelişmeler.</p>
        </div>
        <button type="button" className="tp-content-refresh tp-content-refresh--icon" onClick={() => void loadPublished()} disabled={loading} aria-label="Gündemi yenile" title="Yenile">
          <RefreshCw size={17} className={loading ? 'spin' : ''} />
        </button>
      </header>

      <nav className="tp-content-tabs tp-content-tabs--clean" aria-label="Tarım Gündemi sekmeleri">
        <button type="button" className={activeTab === 'turkey' ? 'active' : ''} onClick={() => setActiveTab('turkey')}>
          <MapPinned size={15} /> Türkiye <small>{turkeyNews.length}</small>
        </button>
        <button type="button" className={activeTab === 'world' ? 'active' : ''} onClick={() => setActiveTab('world')}>
          <Globe2 size={15} /> Dünya <small>{worldNews.length}</small>
        </button>
        <button type="button" className={activeTab === 'articles' ? 'active' : ''} onClick={() => setActiveTab('articles')}>
          <BookOpen size={15} /> Makaleler <small>{articles.length}</small>
        </button>
        <button type="button" onClick={() => onOpenSupport?.()}>
          <Calculator size={15} /> Destekler
        </button>
      </nav>

      {error ? <div className="tp-content-message error"><span>{error}</span><button type="button" onClick={() => setError('')}>Kapat</button></div> : null}

      {loading && !news.length && !articles.length ? (
        <div className="tp-content-state">Tarım Gündemi yükleniyor…</div>
      ) : activeTab !== 'articles' ? (
        visibleNews.length ? (
          <div className="tp-news-carousel-wrap">
            <div className="tp-news-carousel-controls">
              <button type="button" onClick={() => scrollRail(-1)}><ChevronLeft size={18} /></button>
              <button type="button" onClick={() => scrollRail(1)}><ChevronRight size={18} /></button>
            </div>
            <div className="tp-news-carousel" ref={railRef}>
              {visibleNews.map((item) => {
                const image = images[item.id];
                return (
                  <article key={item.id} className="tp-news-slide" onClick={() => void openDetail(item)}>
                    <div className="tp-news-slide__media">
                      <ContentImage image={image} alt={item.title} />
                      <span>{categoryLabel(item)}</span>
                    </div>
                    <div className="tp-news-slide__body">
                      <div className="tp-news-slide__meta"><time>{fmtDate(item.event_date || item.published_at)}</time><span>{readTime(item)} dk</span></div>
                      {item.location_text ? <small className="tp-news-location"><MapPinned size={12} /> {item.location_text}</small> : null}
                      <h3>{item.title}</h3>
                      <p>{item.excerpt || item.body}</p>
                      <footer><small>{sourceName(item)}</small><button type="button" onClick={(event) => { event.stopPropagation(); void openDetail(item); }}>Haberi aç →</button></footer>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ) : <div className="tp-content-state">Bu başlıkta henüz admin onaylı içerik yok.</div>
      ) : articles.length ? (
        <div className="tp-research-list">
          {articles.map((item) => {
            const findings = safeArray(item.structured_body?.findings).slice(0, 3);
            const image = images[item.id];
            return (
              <article key={item.id} className="tp-research-card" onClick={() => void openDetail(item)}>
                <div className="tp-research-card__top">
                  <div className="tp-research-card__copy">
                    <div className="tp-research-card__meta"><span>{categoryLabel(item)}</span><time>Makale tarihi: {fmtDate(item.event_date || item.published_at)}</time><small>{readTime(item)} dk okuma</small></div>
                    <h3>{item.title}</h3>
                    {findings.length ? <ul className="tp-research-findings">{findings.map((finding, index) => <li key={`${item.id}-top-${index}`}>{finding}</li>)}</ul> : null}
                    <p>{item.excerpt || item.body}</p>
                  </div>
                  <ContentImage image={image} className="tp-research-card__image" alt={item.title} />
                </div>
                <footer className="tp-research-card__foot">
                  <div><strong>{item.author_text || sourceName(item)}</strong>{item.institution_text ? <small>{item.institution_text}</small> : null}</div>
                  <RatingStars value={ratings[item.id] ?? 0} average={numberValue(item.average_rating)} count={item.rating_count ?? 0} disabled={ratingBusyId === item.id} onRate={(value) => void rateArticle(item.id, value)} />
                </footer>
              </article>
            );
          })}
        </div>
      ) : <div className="tp-content-state">2 makale adayı admin onay kuyruğunda. Onaylanınca burada görünecek.</div>}
    </section>
  );

  const payload = detailPayload;
  const detailStructured = detail?.structured_body;
  const detailBlock = payload?.detail ?? detailStructured?.detail ?? null;
  const findings = payload?.findings ?? detailStructured?.findings ?? [];
  const takeaway = payload?.practical_takeaway ?? detailStructured?.practical_takeaway ?? '';
  const chart = payload?.chart_data ?? detailStructured?.chart_data ?? null;
  const table = payload?.table_data ?? detailStructured?.table_data ?? null;

  const modal = detail ? createPortal(
    <div className="tp-content-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setDetail(null); }}>
      <article className="tp-content-modal" role="dialog" aria-modal="true">
        <header className="tp-content-modal__head">
          <div><span>{detail.content_subtype === 'article' ? 'AR-GE MAKALESİ' : detail.coverage_scope === 'world' ? 'DÜNYADA TARIM' : 'ÜLKEMİZDE TARIM'}</span><small>{detail.content_subtype === 'article' ? 'Makale tarihi: ' : ''}{fmtDate(payload?.coverage?.event_date || detail.event_date || detail.published_at)} · {detail.location_text || payload?.coverage?.location || 'Konum belirtilmedi'}</small></div>
          <button type="button" onClick={() => setDetail(null)} aria-label="Kapat"><X size={20} /></button>
        </header>
        <div className="tp-content-modal__body">
          <figure className="tp-content-modal__cover"><ContentImage image={images[detail.id]} alt={detail.title} /></figure>
          <h2>{payload?.title || detail.title}</h2>
          {findings.length ? <section className="tp-article-section"><span>ÖNE ÇIKAN BULGULAR</span><ul>{findings.map((finding, index) => <li key={index}>{finding}</li>)}</ul></section> : null}
          <p className="tp-content-modal__lead">{payload?.summary || detail.excerpt || detail.body}</p>
          {detailLoading ? <div className="tp-content-inline-loading">R2 içerik paketi yükleniyor…</div> : null}

          {detailBlock?.what_happened ? <section className="tp-article-section"><span>NE OLDU?</span><p>{detailBlock.what_happened}</p></section> : null}
          {detailBlock?.where_when ? <section className="tp-article-section"><span>NEREDE / NE ZAMAN?</span><p>{detailBlock.where_when}</p></section> : null}
          {detailBlock?.background ? <section className="tp-article-section"><span>ARKA PLAN</span><p>{detailBlock.background}</p></section> : null}
          {detailBlock?.why_it_matters ? <section className="tp-article-section"><span>NEDEN ÖNEMLİ?</span><p>{detailBlock.why_it_matters}</p></section> : null}
          {detailBlock?.producer_impact ? <section className="tp-article-section"><span>ÜRETİCİYE ETKİSİ</span><p>{detailBlock.producer_impact}</p></section> : null}
          {detailBlock?.market_impact ? <section className="tp-article-section"><span>PİYASA ETKİSİ</span><p>{detailBlock.market_impact}</p></section> : null}

          {takeaway ? <section className="tp-article-takeaway"><span>PRATİK ÇIKARIM</span><p>{takeaway}</p></section> : null}
          {chart ? <ArticleChart chart={chart} /> : null}
          {table ? <ArticleTable table={table} /> : null}

          <section className="tp-content-source-box">
            <span>KAYNAK</span>
            <strong>{payload?.source?.name || sourceName(detail)}</strong>
            {payload?.source?.published_at ? <small>Kaynak tarihi: {fmtDate(payload.source.published_at)}</small> : null}
            {detail.doi_number ? <a href={doiUrl(detail.doi_number)} target="_blank" rel="noreferrer">DOI'yi aç <ExternalLink size={14} /></a> : sourceUrl(detail) ? <a href={sourceUrl(detail)} target="_blank" rel="noreferrer">Orijinal kaynağı aç <ExternalLink size={14} /></a> : null}
          </section>
        </div>
      </article>
    </div>, document.body) : null;

  return <>{feed}{modal}</>;
}
