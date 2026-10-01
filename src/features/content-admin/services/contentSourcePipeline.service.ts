import type { ContentCatalogSource } from '../../knowledge/data/sources';
import { importNormalizedCandidates } from './contentSourceCandidate.service';
import { dedupeNormalizedItems } from './contentSourceDedupe.service';
import { normalizeSourceItem, type RawSourceItem } from './contentSourceNormalizer.service';
import { updateSourceRuntime } from './contentSourceRuntime.service';

export type SourceAdapter = (source: ContentCatalogSource) => Promise<RawSourceItem[]>;

export async function runContentSourcePipeline(source: ContentCatalogSource, adapter: SourceAdapter) {
  const startedAt = new Date().toISOString();
  updateSourceRuntime(source.id, { lastScanAt: startedAt, lastError: null });
  try {
    const raw = await adapter(source);
    const trust = source.priority === 'high' ? 88 : source.priority === 'normal' ? 74 : 60;
    const normalized = raw.map(x => normalizeSourceItem(source.kind, x, trust)).filter((x): x is NonNullable<typeof x> => Boolean(x));
    const unique = dedupeNormalizedItems(normalized);
    const saved = importNormalizedCandidates(source.id, unique);
    updateSourceRuntime(source.id, { lastSuccessAt: new Date().toISOString(), foundCount: saved.length, lastError: null });
    return { sourceId: source.id, rawCount: raw.length, normalizedCount: normalized.length, uniqueCount: unique.length, saved };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateSourceRuntime(source.id, { lastError: message });
    throw error;
  }
}

export function createJsonFeedAdapter(endpoint: string): SourceAdapter {
  return async () => {
    const response = await fetch(endpoint, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Kaynak isteği başarısız: ${response.status}`);
    const body = await response.json();
    const rows = Array.isArray(body) ? body : Array.isArray(body?.items) ? body.items : Array.isArray(body?.results) ? body.results : [];
    return rows.map((x: any) => ({ title:x.title, url:x.url || x.link, summary:x.summary || x.description || x.abstract, publishedAt:x.publishedAt || x.published_at || x.date }));
  };
}
