import type { ContentCatalogSource } from '../../knowledge/data/sources';
import type { ContentSourceAdapter } from './contentSourceAdapter.types';
import { contentSourceApiAdapter } from './contentSourceApi.adapter';
import { contentSourceRssAdapter } from './contentSourceRss.adapter';

const adapters: ContentSourceAdapter[] = [
  contentSourceApiAdapter,
  contentSourceRssAdapter,
];

export function registerContentSourceAdapter(adapter: ContentSourceAdapter) {
  const index = adapters.findIndex((item) => item.id === adapter.id);
  if (index >= 0) adapters[index] = adapter;
  else adapters.push(adapter);
}

export function getContentSourceAdapter(source: ContentCatalogSource) {
  return adapters.find((adapter) => adapter.supports(source)) || null;
}

export function canAutomaticallyScanSource(source: ContentCatalogSource) {
  return getContentSourceAdapter(source) !== null;
}

export function listRegisteredContentSourceAdapters() {
  return [...adapters];
}
