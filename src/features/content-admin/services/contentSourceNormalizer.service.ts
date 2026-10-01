import type { ContentSourceKind, KnowledgeGuideCategory } from '../../knowledge/data/sources';

export type RawSourceItem = {
  title?: string | null;
  url?: string | null;
  summary?: string | null;
  description?: string | null;
  publishedAt?: string | null;
  language?: string | null;
  cropTags?: string[];
  regionTags?: string[];
  topicTags?: string[];
  guideCategories?: KnowledgeGuideCategory[];
};

export type NormalizedSourceItem = {
  title: string;
  url: string;
  summary?: string;
  publishedAt?: string;
  cropTags: string[];
  regionTags: string[];
  topicTags: string[];
  guideCategories: KnowledgeGuideCategory[];
  producerValue: number;
  sourceConfidence: number;
};

const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
const unique = (v: string[] = []) => [...new Set(v.map(clean).filter(Boolean))];

export function normalizeSourceUrl(value: string) {
  try {
    const url = new URL(value.trim());
    url.hash = '';
    ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','fbclid','gclid'].forEach(k => url.searchParams.delete(k));
    return url.toString().replace(/\/$/, '');
  } catch { return value.trim().replace(/#.*$/, '').replace(/\/$/, ''); }
}

function producerScore(kind: ContentSourceKind, item: RawSourceItem) {
  const text = `${item.title ?? ''} ${item.summary ?? ''} ${item.description ?? ''}`.toLocaleLowerCase('tr-TR');
  const practical = ['sulama','gübre','hastalık','zararlı','verim','hasat','toprak','ekim','üretici','irrigation','fertil','disease','pest','yield','soil','harvest'];
  const technical = ['benchmark','architecture','transformer','foundation model','neural network'];
  let score = kind === 'guide' ? 72 : kind === 'news' ? 58 : 62;
  practical.forEach(k => { if (text.includes(k)) score += 3; });
  technical.forEach(k => { if (text.includes(k)) score -= 5; });
  return Math.max(0, Math.min(100, score));
}

export function normalizeSourceItem(kind: ContentSourceKind, raw: RawSourceItem, trust = 70): NormalizedSourceItem | null {
  const title = clean(raw.title);
  const url = normalizeSourceUrl(clean(raw.url));
  if (!title || !url) return null;
  return {
    title, url,
    summary: clean(raw.summary || raw.description) || undefined,
    publishedAt: clean(raw.publishedAt) || undefined,
    cropTags: unique(raw.cropTags), regionTags: unique(raw.regionTags), topicTags: unique(raw.topicTags),
    guideCategories: [...new Set(raw.guideCategories || [])],
    producerValue: producerScore(kind, raw), sourceConfidence: Math.max(0, Math.min(100, trust)),
  };
}
