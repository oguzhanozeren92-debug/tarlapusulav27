import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, RefreshCw, Search, Sprout } from 'lucide-react';
import { supabase } from '../../../supabaseClient';
import { KNOWLEDGE_GUIDE, type KnowledgeGuideEntry } from '../data/guide.ts';
import { knowledgeEntries } from '../services/catalog.ts';
import { knowledgeSources } from '../data/sources.ts';
import './KnowledgeLibrary.css';

type LiveGuideStructuredBody = {
  channel?: string | null;
  problem?: string | null;
  findings?: string[] | null;
  practical_takeaway?: string | null;
  crop_matches?: string[] | null;
  topic?: string | null;
  guide?: {
    problem_or_goal?: string | null;
    when_to_check?: string[] | null;
    what_to_look_for?: string[] | null;
    field_check_steps?: string[] | null;
    management_steps?: string[] | null;
    prevention?: string[] | null;
    avoid?: string[] | null;
    turkey_note?: string | null;
    source_sufficiency?: 'strong' | 'medium' | 'weak' | string | null;
    producer_value_score?: number | null;
  } | null;
  detail?: {
    lead?: string | null;
    background?: string | null;
    what_happened?: string | null;
    why_it_matters?: string | null;
    producer_impact?: string | null;
    where_when?: string | null;
    source_note?: string | null;
  } | null;
};

type LiveGuideRow = {
  id: string;
  title: string;
  excerpt: string | null;
  body: string | null;
  category: string | null;
  tags: string[] | null;
  crop_tags: string[] | null;
  source_refs: Array<Record<string, unknown>> | null;
  published_at: string | null;
  updated_at: string | null;
  content_subtype: string | null;
  structured_body: LiveGuideStructuredBody | null;
};

type KnowledgeCard = {
  key: string;
  kind: 'static' | 'live';
  category: string;
  title: string;
  summary: string;
  crops: string[];
  publishedAt: string | null;
  sourceName: string;
  sourceUrl: string;
  staticEntry?: KnowledgeGuideEntry;
  liveRow?: LiveGuideRow;
};

type KnowledgeLibraryProps = {
  fieldCrops?: string[];
};

const normalize = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const uniqueText = (values: Array<string | null | undefined>) =>
  [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];

const cropNames = (row: LiveGuideRow) =>
  uniqueText([
    ...(row.crop_tags ?? []),
    ...(row.structured_body?.crop_matches ?? []),
  ]);

const sourceLabel = (row: LiveGuideRow) => {
  const first = row.source_refs?.[0];
  const sourceName = typeof first?.source_name === 'string' ? first.source_name.trim() : '';
  return sourceName || 'Kaynak';
};

const sourceUrl = (row: LiveGuideRow) => {
  const first = row.source_refs?.[0];
  return typeof first?.url === 'string' ? first.url : '';
};

const fmtDate = (value: string | null) => {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' }).format(new Date(value));
  } catch {
    return '';
  }
};

const matchesFieldCrop = (card: KnowledgeCard, fieldCrops: string[]) => {
  if (!fieldCrops.length) return false;
  const cardCrops = card.crops.map(normalize);
  const haystack = normalize(`${card.title} ${card.summary} ${card.category}`);

  return fieldCrops.some((crop) => {
    const key = normalize(crop);
    return key.length > 1 && (cardCrops.includes(key) || haystack.includes(key));
  });
};

const staticCards = (): KnowledgeCard[] =>
  KNOWLEDGE_GUIDE.map((entry) => ({
    key: `static:${entry.id}`,
    kind: 'static' as const,
    category: entry.category,
    title: entry.title,
    summary: entry.summary,
    crops: [],
    publishedAt: null,
    sourceName: 'TarlaPusula Bilgi Rehberi',
    sourceUrl: '',
    staticEntry: entry,
  }));

const liveCards = (rows: LiveGuideRow[]): KnowledgeCard[] =>
  rows.map((row) => ({
    key: `live:${row.id}`,
    kind: 'live' as const,
    category: row.category || row.structured_body?.topic || 'Bilgi Rehberi',
    title: row.title,
    summary: row.excerpt || row.structured_body?.detail?.lead || row.body?.slice(0, 360) || 'Özet hazırlanıyor.',
    crops: cropNames(row),
    publishedAt: row.published_at || row.updated_at,
    sourceName: sourceLabel(row),
    sourceUrl: sourceUrl(row),
    liveRow: row,
  }));

export default function KnowledgeLibrary({ fieldCrops = [] }: KnowledgeLibraryProps) {
  const [liveRows, setLiveRows] = useState<LiveGuideRow[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Tümü');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const normalizedFieldCrops = useMemo(() => uniqueText(fieldCrops), [fieldCrops]);
  const labels = useMemo(() => knowledgeEntries.filter((entry) => entry.contentType === 'label'), []);

  const loadLiveGuide = async (manual = false) => {
    if (manual) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      const { data, error: guideError } = await supabase
        .from('content_items')
        .select('id,title,excerpt,body,category,tags,crop_tags,source_refs,published_at,updated_at,content_subtype,structured_body')
        .eq('status', 'published')
        .eq('content_type', 'knowledge')
        .eq('content_subtype', 'guide')
        .order('published_at', { ascending: false })
        .limit(250);

      if (guideError) throw guideError;
      setLiveRows((data ?? []) as LiveGuideRow[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Onaylı Bilgi Rehberi içerikleri yüklenemedi.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadLiveGuide();
  }, []);

  const cards = useMemo(() => {
    const live = liveCards(liveRows);
    const all = [...live, ...staticCards()];

    return all.sort((a, b) => {
      const aMine = matchesFieldCrop(a, normalizedFieldCrops) ? 1 : 0;
      const bMine = matchesFieldCrop(b, normalizedFieldCrops) ? 1 : 0;
      if (aMine !== bMine) return bMine - aMine;

      if (a.kind !== b.kind) return a.kind === 'live' ? -1 : 1;

      const aDate = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const bDate = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return bDate - aDate;
    });
  }, [liveRows, normalizedFieldCrops]);

  const categories = useMemo(
    () => uniqueText(cards.map((card) => card.category)).sort((a, b) => a.localeCompare(b, 'tr')),
    [cards],
  );

  const visibleCards = useMemo(() => {
    const needle = normalize(query);

    return cards.filter((card) => {
      if (category !== 'Tümü' && card.category !== category) return false;
      if (!needle) return true;

      const haystack = normalize([
        card.title,
        card.summary,
        card.category,
        ...card.crops,
        ...(card.liveRow?.tags ?? []),
      ].join(' '));

      return haystack.includes(needle);
    });
  }, [cards, query, category]);

  const selected = cards.find((card) => card.key === selectedKey) ?? null;

  if (selected?.staticEntry) {
    const item = selected.staticEntry;
    return (
      <section className="tp-knowledge" aria-labelledby="knowledge-detail-heading">
        <article className="tp-knowledge-detail">
          <button type="button" className="tp-knowledge-back" onClick={() => setSelectedKey(null)}>
            ‹ Bilgi Rehberine dön
          </button>
          <small>{item.category}</small>
          <h1 id="knowledge-detail-heading">{item.title}</h1>
          <p className="tp-knowledge-detail__lead">{item.summary}</p>
          {item.sections.map(([title, body]) => (
            <section key={`${item.id}:${title}`}>
              <h2>{title}</h2>
              <p>{body}</p>
            </section>
          ))}
          <p className="tp-knowledge-note">
            Genel bilgilendirme amaçlıdır. Kesin teşhis, doz veya reçete değildir; tarla uygulamalarında analiz, yerel koşullar, yürürlükteki resmî bilgiler ve gerektiğinde yetkili uzman değerlendirmesi esas alınmalıdır.
          </p>
        </article>
      </section>
    );
  }

  if (selected?.liveRow) {
    const row = selected.liveRow;
    const findings = Array.isArray(row.structured_body?.findings)
      ? row.structured_body!.findings!.filter(Boolean)
      : [];
    const crops = cropNames(row);
    const url = sourceUrl(row);
    const detail = row.structured_body?.detail;
    const guide = row.structured_body?.guide;
    const guideLists = {
      when: (guide?.when_to_check ?? []).filter(Boolean),
      look: (guide?.what_to_look_for ?? []).filter(Boolean),
      check: (guide?.field_check_steps ?? []).filter(Boolean),
      manage: (guide?.management_steps ?? []).filter(Boolean),
      prevent: (guide?.prevention ?? []).filter(Boolean),
      avoid: (guide?.avoid ?? []).filter(Boolean),
    };
    const hasPracticalGuide = Boolean(
      guide &&
      (guide.problem_or_goal ||
        guideLists.when.length ||
        guideLists.look.length ||
        guideLists.check.length ||
        guideLists.manage.length ||
        guideLists.prevent.length ||
        guideLists.avoid.length),
    );

    return (
      <section className="tp-knowledge" aria-labelledby="knowledge-detail-heading">
        <article className="tp-knowledge-detail">
          <button type="button" className="tp-knowledge-back" onClick={() => setSelectedKey(null)}>
            ‹ Bilgi Rehberine dön
          </button>

          <div className="tp-knowledge-detail__meta">
            <span>{row.category || row.structured_body?.topic || 'Bilgi Rehberi'}</span>
            <span className="is-approved">Admin onaylı</span>
            {crops.map((crop) => <span key={crop}>{crop}</span>)}
            {row.published_at ? <span>{fmtDate(row.published_at)}</span> : null}
          </div>

          <h1 id="knowledge-detail-heading">{row.title}</h1>
          {row.excerpt ? <p className="tp-knowledge-detail__lead">{row.excerpt}</p> : null}

          {hasPracticalGuide ? (
            <>
              {guide?.problem_or_goal ? (
                <section>
                  <h2>Bu rehber neyi çözmeye yardım ediyor?</h2>
                  <p>{guide.problem_or_goal}</p>
                </section>
              ) : null}

              {guideLists.when.length ? (
                <section>
                  <h2>Ne zaman kontrol et?</h2>
                  <ul>{guideLists.when.map((item, index) => <li key={`${row.id}-when-${index}`}>{item}</li>)}</ul>
                </section>
              ) : null}

              {guideLists.look.length ? (
                <section>
                  <h2>Neye bak?</h2>
                  <ul>{guideLists.look.map((item, index) => <li key={`${row.id}-look-${index}`}>{item}</li>)}</ul>
                </section>
              ) : null}

              {guideLists.check.length ? (
                <section>
                  <h2>Tarlada nasıl kontrol et?</h2>
                  <ol>{guideLists.check.map((item, index) => <li key={`${row.id}-check-${index}`}>{item}</li>)}</ol>
                </section>
              ) : null}

              {guideLists.manage.length ? (
                <section>
                  <h2>Ne yapabilirsin?</h2>
                  <ul>{guideLists.manage.map((item, index) => <li key={`${row.id}-manage-${index}`}>{item}</li>)}</ul>
                </section>
              ) : null}

              {guideLists.prevent.length ? (
                <section>
                  <h2>Önleyici adımlar</h2>
                  <ul>{guideLists.prevent.map((item, index) => <li key={`${row.id}-prevent-${index}`}>{item}</li>)}</ul>
                </section>
              ) : null}

              {guideLists.avoid.length ? (
                <section>
                  <h2>Ne yapma?</h2>
                  <ul>{guideLists.avoid.map((item, index) => <li key={`${row.id}-avoid-${index}`}>{item}</li>)}</ul>
                </section>
              ) : null}

              {guide?.turkey_note ? (
                <aside className="tp-knowledge-takeaway">
                  <strong>Türkiye için not</strong>
                  <p>{guide.turkey_note}</p>
                </aside>
              ) : null}
            </>
          ) : (
            <>
              {detail?.background ? (
                <section>
                  <h2>Arka plan</h2>
                  <p>{detail.background}</p>
                </section>
              ) : null}

              {detail?.what_happened ? (
                <section>
                  <h2>Ne anlatıyor?</h2>
                  <p>{detail.what_happened}</p>
                </section>
              ) : null}

              {findings.length ? (
                <section>
                  <h2>Öne çıkan bilgiler</h2>
                  <ul>{findings.map((finding, index) => <li key={`${row.id}-finding-${index}`}>{finding}</li>)}</ul>
                </section>
              ) : null}

              {row.body ? (
                <section>
                  <h2>Detay</h2>
                  {row.body.split(/\n{2,}/).map((paragraph, index) => (
                    <p key={`${row.id}-paragraph-${index}`}>{paragraph}</p>
                  ))}
                </section>
              ) : null}
            </>
          )}

          {row.structured_body?.practical_takeaway ? (
            <aside className="tp-knowledge-takeaway">
              <strong>Sahada ne anlama geliyor?</strong>
              <p>{row.structured_body.practical_takeaway}</p>
            </aside>
          ) : null}

          <footer className="tp-knowledge-detail__source">
            <span>Kaynak: {sourceLabel(row)}</span>
            {url ? <a href={url} target="_blank" rel="noreferrer">Kaynağı aç <ExternalLink size={13} /></a> : null}
          </footer>

          <p className="tp-knowledge-note">
            Bu içerik admin onayından geçmiş Bilgi Rehberi içeriğidir. Genel bilgilendirme amaçlıdır; kesin teşhis, reçete veya tek başına uygulama kararı değildir.
          </p>
        </article>
      </section>
    );
  }

  return (
    <section className="tp-knowledge" aria-labelledby="knowledge-heading">
      <header className="tp-knowledge-head">
        <div>
          <p className="tp-knowledge-eyebrow">BİLGİ REHBERİ</p>
          <h1 id="knowledge-heading">Türkçe bilgi kütüphanesi</h1>
          <p>Temel rehber kartlarıyla birlikte admin onayından geçen yeni içerikler de burada yayınlanır.</p>
        </div>
        <button type="button" className="tp-knowledge-refresh" onClick={() => void loadLiveGuide(true)} disabled={refreshing}>
          <RefreshCw size={16} className={refreshing ? 'is-spinning' : ''} /> Yenile
        </button>
      </header>

      {normalizedFieldCrops.length ? (
        <div className="tp-knowledge-crop-strip" aria-label="Tarlalarımdaki ürünler">
          <Sprout size={16} />
          <span>Tarlalarındaki ürünler:</span>
          {normalizedFieldCrops.map((crop) => <strong key={crop}>{crop}</strong>)}
        </div>
      ) : null}

      <div className="tp-knowledge-filters">
        <label className="tp-knowledge-search">
          <Search size={16} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Örn. badem, azot, NDVI, sulama, pH…"
          />
        </label>
        <label>
          <span>Konu</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option>Tümü</option>
            {categories.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
      </div>

      {error ? <div className="tp-knowledge-state is-error">{error}</div> : null}
      {loading ? <div className="tp-knowledge-state">Onaylı Bilgi Rehberi içerikleri yükleniyor…</div> : null}

      <p role="status" className="tp-knowledge-count">
        {visibleCards.length} rehber konusu · {liveRows.length} admin onaylı canlı içerik
      </p>

      <div className="tp-knowledge-grid">
        {visibleCards.map((card) => {
          const mine = matchesFieldCrop(card, normalizedFieldCrops);
          return (
            <article key={card.key} className={`tp-knowledge-card ${card.kind === 'live' ? 'is-live' : ''}`}>
              <div className="tp-knowledge-card__meta">
                <span>{card.category} · Rehber</span>
                {card.kind === 'live' ? <span className="is-approved">Admin onaylı</span> : null}
                {mine ? <span className="is-mine">Senin ürünün</span> : null}
              </div>
              <h2>{card.title}</h2>
              <p>{card.summary}</p>
              {card.crops.length ? (
                <div className="tp-knowledge-card__crops">
                  {card.crops.slice(0, 4).map((crop) => <span key={`${card.key}:${crop}`}>{crop}</span>)}
                </div>
              ) : null}
              <footer>
                <small>
                  {card.kind === 'live'
                    ? `${card.sourceName}${card.publishedAt ? ` · ${fmtDate(card.publishedAt)}` : ''}`
                    : 'TarlaPusula temel rehberi'}
                </small>
                <button type="button" onClick={() => setSelectedKey(card.key)}>Bilgiyi aç</button>
              </footer>
            </article>
          );
        })}
      </div>

      {!visibleCards.length ? (
        <div className="tp-knowledge-empty">
          <strong>Bu filtrede rehber kartı bulunamadı.</strong>
          <p>Arama veya konu filtresini değiştir.</p>
        </div>
      ) : null}

      <details className="tp-knowledge-sources">
        <summary>Hastalık sözlüğü ({labels.length})</summary>
        <p>PlantVillage sınıf adları yalnızca arama ve sınıflandırma sözlüğüdür; teşhis veya mücadele talimatı değildir.</p>
        {labels.map((entry) => (
          <article key={entry.id}>
            <h2>{entry.titleTr}</h2>
            <p>{entry.crops.join(' · ')}</p>
          </article>
        ))}
      </details>

      <details className="tp-knowledge-sources">
        <summary>Kaynaklar ve lisans bilgisi</summary>
        {knowledgeSources.map((source) => (
          <article key={source.id}>
            <h2>{source.name}</h2>
            <p>{source.description}</p>
            <small>{source.license} · Kaynak kontrolü: {source.checkedAt}</small>
          </article>
        ))}
      </details>
    </section>
  );
}
