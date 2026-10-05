import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ExternalLink,
  RefreshCw,
  Search,
  Sprout,
  X,
} from 'lucide-react';
import { supabase } from '../../../supabaseClient';
import './KnowledgeLibrary.css';

type GuideData = {
  quick_answer?: string | null;
  why_it_matters?: string | null;
  when_to_check?: string[] | null;
  what_to_look_for?: string[] | null;
  field_check_steps?: string[] | null;
  decision_rules?: string[] | null;
  management_steps?: string[] | null;
  prevention?: string[] | null;
  common_mistakes?: string[] | null;
  avoid?: string[] | null;
  turkey_note?: string | null;
  producer_value_score?: number | null;
};

type KnowledgeStructuredBody = {
  crop_matches?: string[] | null;
  topic?: string | null;
  guide?: GuideData | null;
};

type KnowledgeRow = {
  id: string;
  title: string;
  excerpt: string | null;
  body: string | null;
  category: string | null;
  tags: string[] | null;
  crop_tags: string[] | null;
  source_refs: Array<Record<string, unknown>> | null;
  structured_body: KnowledgeStructuredBody | null;
  published_at?: string | null;
};

type KnowledgeCard = {
  id: string;
  category: string;
  title: string;
  summary: string;
  fullBody: string;
  highlights: string[];
  details: string[];
  crops: string[];
  sourceName: string;
  sourceUrl: string;
  quality: number;
  publishedAt: string | null;
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

const sourceName = (row: KnowledgeRow) => {
  const first = row.source_refs?.[0];
  return typeof first?.source_name === 'string' && first.source_name.trim()
    ? first.source_name.trim()
    : 'Kaynak';
};

const sourceUrl = (row: KnowledgeRow) => {
  const first = row.source_refs?.[0];
  return typeof first?.url === 'string' ? first.url : '';
};

const cropNames = (row: KnowledgeRow) =>
  uniqueText([
    ...(row.crop_tags ?? []),
    ...(row.structured_body?.crop_matches ?? []),
  ]);

const pickHighlights = (guide: GuideData | null | undefined) => {
  if (!guide) return [];
  return uniqueText([
    ...(guide.what_to_look_for ?? []).slice(0, 1),
    ...(guide.when_to_check ?? []).slice(0, 1),
    ...(guide.management_steps ?? []).slice(0, 1),
  ]).slice(0, 3);
};

const pickDetails = (guide: GuideData | null | undefined) => {
  if (!guide) return [];
  return uniqueText([
    ...(guide.field_check_steps ?? []),
    ...(guide.decision_rules ?? []),
    ...(guide.prevention ?? []),
    ...(guide.common_mistakes ?? []).map((item) => `Sık hata: ${item}`),
    ...(guide.avoid ?? []).map((item) => `Kaçın: ${item}`),
    guide.turkey_note || '',
  ]).slice(0, 8);
};

const toCard = (row: KnowledgeRow): KnowledgeCard => {
  const guide = row.structured_body?.guide;
  return {
    id: row.id,
    category: row.category || row.structured_body?.topic || 'Genel Bilgi',
    title: row.title,
    summary: guide?.quick_answer || row.excerpt || row.body || 'Bilgi hazırlanıyor.',
    fullBody: String(row.body || '').trim(),
    highlights: pickHighlights(guide),
    details: pickDetails(guide),
    crops: cropNames(row),
    sourceName: sourceName(row),
    sourceUrl: sourceUrl(row),
    quality: Number(guide?.producer_value_score ?? 0),
    publishedAt: row.published_at ?? null,
  };
};

const matchesFieldCrop = (card: KnowledgeCard, fieldCrops: string[]) => {
  if (!fieldCrops.length) return false;
  const haystack = normalize(
    `${card.title} ${card.summary} ${card.highlights.join(' ')} ${card.category} ${card.crops.join(' ')}`,
  );

  return fieldCrops.some((crop) => {
    const key = normalize(crop);
    return key.length > 1 && haystack.includes(key);
  });
};

export default function KnowledgeLibrary({ fieldCrops = [] }: KnowledgeLibraryProps) {
  const [rows, setRows] = useState<KnowledgeRow[]>([]);
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<KnowledgeCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const normalizedFieldCrops = useMemo(() => uniqueText(fieldCrops), [fieldCrops]);

  const loadCards = async (manual = false) => {
    if (manual) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      // Bilgi Rehberi kullanıcı tarafında yalnızca admin onayından geçip
      // published durumuna alınmış rehberleri gösterir.
      const { data, error: fetchError } = await supabase
        .from('content_items')
        .select('id,title,excerpt,body,category,tags,crop_tags,source_refs,structured_body,published_at')
        .eq('status', 'published')
        .eq('content_type', 'knowledge')
        .eq('content_subtype', 'guide')
        .order('published_at', { ascending: false })
        .limit(300);

      if (fetchError) throw fetchError;
      setRows((data ?? []) as KnowledgeRow[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bilgi kartları yüklenemedi.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadCards();
  }, []);

  const cards = useMemo(() => {
    return rows
      .map(toCard)
      .sort((a, b) => {
        const aMine = matchesFieldCrop(a, normalizedFieldCrops) ? 1 : 0;
        const bMine = matchesFieldCrop(b, normalizedFieldCrops) ? 1 : 0;
        if (aMine !== bMine) return bMine - aMine;
        if (a.quality !== b.quality) return b.quality - a.quality;
        return a.title.localeCompare(b.title, 'tr');
      });
  }, [rows, normalizedFieldCrops]);

  const categoryGroups = useMemo(() => {
    const map = new Map<string, KnowledgeCard[]>();
    cards.forEach((card) => {
      const bucket = map.get(card.category) ?? [];
      bucket.push(card);
      map.set(card.category, bucket);
    });

    return [...map.entries()]
      .map(([name, items]) => ({
        name,
        items,
        mine: items.filter((item) => matchesFieldCrop(item, normalizedFieldCrops)).length,
      }))
      .sort((a, b) => {
        if (a.mine !== b.mine) return b.mine - a.mine;
        return a.name.localeCompare(b.name, 'tr');
      });
  }, [cards, normalizedFieldCrops]);

  const needle = normalize(query);

  const searchedCards = useMemo(() => {
    if (!needle) return [];
    return cards.filter((card) =>
      normalize(
        `${card.title} ${card.summary} ${card.highlights.join(' ')} ${card.details.join(' ')} ${card.category} ${card.crops.join(' ')}`,
      ).includes(needle),
    );
  }, [cards, needle]);

  const categoryCards = useMemo(() => {
    if (!selectedCategory) return [];
    return cards.filter((card) => card.category === selectedCategory);
  }, [cards, selectedCategory]);

  const shownCards = needle ? searchedCards : categoryCards;
  const cardListMode = Boolean(needle || selectedCategory);

  const closeDetail = () => setSelectedCard(null);

  return (
    <section className="tp-knowledge" aria-labelledby="knowledge-heading">
      <header className="tp-knowledge-head">
        <div>
          <p className="tp-knowledge-eyebrow">BİLGİ REHBERİ</p>
          <h1 id="knowledge-heading">
            {selectedCategory && !needle ? selectedCategory : 'Bir konu seç'}
          </h1>
          <p>
            {selectedCategory && !needle
              ? 'Admin onaylı bilgi kartlarından birini aç.'
              : 'Kısa konu kartlarından seçim yap; yalnız onaylanmış bilgiler gösterilir.'}
          </p>
        </div>

        <button
          type="button"
          className="tp-knowledge-refresh"
          onClick={() => void loadCards(true)}
          disabled={refreshing}
          aria-label="Bilgi Rehberini yenile"
        >
          <RefreshCw size={16} className={refreshing ? 'is-spinning' : ''} />
        </button>
      </header>

      {selectedCategory && !needle ? (
        <button
          type="button"
          className="tp-knowledge-back"
          onClick={() => setSelectedCategory(null)}
        >
          <ArrowLeft size={15} />
          Konulara dön
        </button>
      ) : null}

      {normalizedFieldCrops.length && !selectedCategory && !needle ? (
        <div className="tp-knowledge-crop-strip" aria-label="Tarlalarımdaki ürünler">
          <Sprout size={15} />
          <span>Öncelik:</span>
          {normalizedFieldCrops.slice(0, 4).map((crop) => <strong key={crop}>{crop}</strong>)}
        </div>
      ) : null}

      <label className="tp-knowledge-search">
        <Search size={16} />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Bilgi kartı ara…"
        />
      </label>

      {error ? <div className="tp-knowledge-state is-error">{error}</div> : null}
      {loading ? <div className="tp-knowledge-state">Admin onaylı kartlar yükleniyor…</div> : null}

      {!loading && !cardListMode ? (
        <>
          <div className="tp-knowledge-section-title">
            <strong>Konular</strong>
            <span>{cards.length} onaylı kart</span>
          </div>

          <div className="tp-knowledge-topic-grid" role="list">
            {categoryGroups.map((group) => (
              <button
                key={group.name}
                type="button"
                role="listitem"
                className="tp-knowledge-topic-card"
                onClick={() => setSelectedCategory(group.name)}
              >
                <span className="tp-knowledge-topic-card__count">{group.items.length}</span>
                <strong>{group.name}</strong>
                <small>
                  {group.mine
                    ? `${group.mine} kart senin ürünlerinle ilgili`
                    : 'Bilgi kartlarını aç'}
                </small>
                <b aria-hidden="true">›</b>
              </button>
            ))}
          </div>
        </>
      ) : null}

      {!loading && cardListMode ? (
        <>
          <div className="tp-knowledge-section-title">
            <strong>{needle ? 'Arama sonuçları' : selectedCategory}</strong>
            <span>{shownCards.length} kart</span>
          </div>

          <div className="tp-knowledge-card-grid">
            {shownCards.map((card) => {
              const mine = matchesFieldCrop(card, normalizedFieldCrops);
              return (
                <button
                  key={card.id}
                  type="button"
                  className="tp-knowledge-info-card"
                  onClick={() => setSelectedCard(card)}
                >
                  <div className="tp-knowledge-info-card__top">
                    <span>{card.category}</span>
                    {mine ? <em>Senin ürünün</em> : null}
                  </div>

                  <strong>{card.title}</strong>
                  <p>{card.summary}</p>

                  <div className="tp-knowledge-info-card__foot">
                    <small>{card.sourceName}</small>
                    <b aria-hidden="true">›</b>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      {!loading && !cards.length ? (
        <div className="tp-knowledge-empty">
          <strong>Henüz yayınlanmış bilgi kartı yok.</strong>
          <p>Admin onayladıkça kartlar burada görünür.</p>
        </div>
      ) : null}

      {!loading && cardListMode && !shownCards.length ? (
        <div className="tp-knowledge-empty">
          <strong>Bu seçimde kart bulunamadı.</strong>
          <p>Başka bir konu seç veya aramayı değiştir.</p>
        </div>
      ) : null}

      {selectedCard ? (
        <div className="tp-knowledge-detail-layer" role="presentation" onMouseDown={closeDetail}>
          <article
            className="tp-knowledge-detail-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={selectedCard.title}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="tp-knowledge-detail-sheet__head">
              <div>
                <span>{selectedCard.category}</span>
                <small>Admin onaylı bilgi kartı</small>
              </div>
              <button type="button" onClick={closeDetail} aria-label="Kapat">
                <X size={18} />
              </button>
            </div>

            <h2>{selectedCard.title}</h2>
            {selectedCard.summary ? (
              <p className="tp-knowledge-detail-sheet__summary">{selectedCard.summary}</p>
            ) : null}

            {selectedCard.fullBody && selectedCard.fullBody !== selectedCard.summary ? (
              <div className="tp-knowledge-detail-sheet__full-body">
                {selectedCard.fullBody}
              </div>
            ) : null}

            {selectedCard.highlights.length ? (
              <section>
                <strong>Önemli noktalar</strong>
                <ul>
                  {selectedCard.highlights.map((item, index) => (
                    <li key={`${selectedCard.id}:highlight:${index}`}>{item}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {selectedCard.details.length ? (
              <section>
                <strong>Biraz daha detay</strong>
                <ul>
                  {selectedCard.details.map((item, index) => (
                    <li key={`${selectedCard.id}:detail:${index}`}>{item}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {selectedCard.crops.length ? (
              <div className="tp-knowledge-detail-crops">
                {selectedCard.crops.slice(0, 6).map((crop) => <span key={crop}>{crop}</span>)}
              </div>
            ) : null}

            <footer>
              <span>Kaynak: {selectedCard.sourceName}</span>
              {selectedCard.sourceUrl ? (
                <a href={selectedCard.sourceUrl} target="_blank" rel="noreferrer">
                  Kaynağı aç <ExternalLink size={13} />
                </a>
              ) : null}
            </footer>
          </article>
        </div>
      ) : null}
    </section>
  );
}
