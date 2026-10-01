import {
  contentSourceCatalog,
  type ContentCatalogSource,
  type ContentSourceKind,
  type KnowledgeGuideCategory,
} from '../../knowledge/data/sources';

export type SourceCandidateStatus = 'new' | 'review' | 'approved' | 'rejected';

export interface ContentSourceCandidate {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceKind: ContentSourceKind;
  language: 'tr' | 'en';
  title: string;
  url: string;
  publishedAt?: string;
  summary?: string;
  cropTags: string[];
  regionTags: string[];
  topicTags: string[];
  guideCategories: KnowledgeGuideCategory[];
  status: SourceCandidateStatus;
  producerValue: number;
  sourceConfidence: number;
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = 'tp_content_source_candidates_v1';
const EVENT_NAME = 'tp:content-source-candidates';

const now = () => new Date().toISOString();

function readRaw(): ContentSourceCandidate[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRaw(items: ContentSourceCandidate[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

function normalizeUrl(value: string) {
  return String(value || '').trim().replace(/#.*$/, '').replace(/\/$/, '');
}

function candidateKey(item: Pick<ContentSourceCandidate, 'url' | 'title'>) {
  const url = normalizeUrl(item.url);
  if (url) return `url:${url.toLocaleLowerCase('tr-TR')}`;
  return `title:${String(item.title || '').trim().toLocaleLowerCase('tr-TR')}`;
}

export function listContentSourceCandidates(filters?: {
  status?: SourceCandidateStatus;
  kind?: ContentSourceKind;
  sourceId?: string;
}) {
  return readRaw()
    .filter((item) => !filters?.status || item.status === filters.status)
    .filter((item) => !filters?.kind || item.sourceKind === filters.kind)
    .filter((item) => !filters?.sourceId || item.sourceId === filters.sourceId)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export function saveContentSourceCandidate(
  input: Omit<ContentSourceCandidate, 'id' | 'createdAt' | 'updatedAt'> &
    Partial<Pick<ContentSourceCandidate, 'id' | 'createdAt'>>,
) {
  const items = readRaw();
  const key = candidateKey(input);
  const existingIndex = items.findIndex((item) => candidateKey(item) === key);
  const existing = existingIndex >= 0 ? items[existingIndex] : undefined;

  const next: ContentSourceCandidate = {
    ...input,
    id: input.id || existing?.id || crypto.randomUUID(),
    createdAt: input.createdAt || existing?.createdAt || now(),
    updatedAt: now(),
  };

  if (existingIndex >= 0) items[existingIndex] = { ...existing, ...next };
  else items.push(next);

  writeRaw(items);
  return next;
}

export function setContentSourceCandidateStatus(id: string, status: SourceCandidateStatus) {
  const items = readRaw();
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return null;
  items[index] = { ...items[index], status, updatedAt: now() };
  writeRaw(items);
  return items[index];
}

export function removeContentSourceCandidate(id: string) {
  const next = readRaw().filter((item) => item.id !== id);
  writeRaw(next);
}

export function subscribeContentSourceCandidates(callback: () => void) {
  if (typeof window === 'undefined') return () => undefined;
  const handler = () => callback();
  window.addEventListener(EVENT_NAME, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener('storage', handler);
  };
}

export function getSourceDefinition(sourceId: string): ContentCatalogSource | undefined {
  return contentSourceCatalog.find((item) => item.id === sourceId);
}

/**
 * Tarayıcı katmanı bu fonksiyona normalize edilmiş adayları verir.
 * Burada bilinçli olarak harici site fetch'i yapılmaz:
 * API/RSS/web adaptörleri backend/edge tarafında çalışacak ve lisans/robots/erişim
 * koşulları kaynak bazında uygulanacaktır.
 */
export function importNormalizedCandidates(
  sourceId: string,
  candidates: Array<{
    title: string;
    url: string;
    publishedAt?: string;
    summary?: string;
    cropTags?: string[];
    regionTags?: string[];
    topicTags?: string[];
    guideCategories?: KnowledgeGuideCategory[];
    producerValue?: number;
    sourceConfidence?: number;
  }>,
) {
  const source = getSourceDefinition(sourceId);
  if (!source) throw new Error(`Bilinmeyen kaynak: ${sourceId}`);

  return candidates.map((item) =>
    saveContentSourceCandidate({
      sourceId: source.id,
      sourceName: source.name,
      sourceKind: source.kind,
      language: source.language,
      title: item.title.trim(),
      url: item.url.trim(),
      publishedAt: item.publishedAt,
      summary: item.summary,
      cropTags: item.cropTags || [],
      regionTags: item.regionTags || [],
      topicTags: item.topicTags || [],
      guideCategories: item.guideCategories || [],
      status: 'new',
      producerValue: Math.max(0, Math.min(100, item.producerValue ?? 50)),
      sourceConfidence: Math.max(0, Math.min(100, item.sourceConfidence ?? 70)),
    }),
  );
}
