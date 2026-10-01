import type { ContentCatalogSource } from '../../knowledge/data/sources';
import type {
  ContentSourceAdapter,
  RawSourceItem,
  SourceAdapterContext,
} from './contentSourceAdapter.types';
import { SourceAdapterError } from './contentSourceAdapter.types';

type JsonRecord = Record<string, unknown>;

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';

function mapGenericItem(value: unknown): RawSourceItem | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as JsonRecord;
  const title = text(row.title) || text(row.name);
  const url = text(row.url) || text(row.link) || text(row.doi);
  if (!title || !url) return null;

  return {
    title,
    url: url.startsWith('10.') ? `https://doi.org/${url}` : url,
    summary: text(row.abstract) || text(row.summary) || text(row.description),
    publishedAt: text(row.publishedAt) || text(row.published) || text(row.date),
    externalId: text(row.id) || text(row.doi),
  };
}

function endpointFor(source: ContentCatalogSource): string | null {
  switch (source.id) {
    case 'crossref':
      return 'https://api.crossref.org/works?query=agriculture&filter=from-pub-date:2025-01-01&rows=25';
    case 'openalex':
      return 'https://api.openalex.org/works?search=agriculture&per-page=25';
    case 'semantic-scholar':
      return 'https://api.semanticscholar.org/graph/v1/paper/search?query=agriculture&limit=25&fields=title,url,abstract,year';
    default:
      return null;
  }
}

function extractRows(sourceId: string, json: JsonRecord): unknown[] {
  if (sourceId === 'crossref') {
    const message = json.message as JsonRecord | undefined;
    return Array.isArray(message?.items) ? message.items : [];
  }
  if (sourceId === 'openalex') return Array.isArray(json.results) ? json.results : [];
  if (sourceId === 'semantic-scholar') return Array.isArray(json.data) ? json.data : [];
  return [];
}

export const contentSourceApiAdapter: ContentSourceAdapter = {
  id: 'api',
  supports(source) {
    return source.ingestion === 'api' && endpointFor(source) !== null;
  },
  async fetch({ source, signal }: SourceAdapterContext) {
    const endpoint = endpointFor(source);
    if (!endpoint) return [];

    try {
      const response = await fetch(endpoint, {
        signal,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json() as JsonRecord;
      return extractRows(source.id, json)
        .map(mapGenericItem)
        .filter((item): item is RawSourceItem => Boolean(item));
    } catch (error) {
      throw new SourceAdapterError('API kaynağı okunamadı.', source.id, error);
    }
  },
};
