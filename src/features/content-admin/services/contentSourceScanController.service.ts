import { contentSourceCatalog } from '../../knowledge/data/sources';
import { scanSourcesToDatabase } from './contentSourceScanner.service';
import type { ContentSourceKind } from '../../knowledge/data/sources';
import { markSourceScanStarted, markSourceScanFinished } from './contentSourceScanState.service';
import type { SourceScanResult } from './contentSourceScanner.service';

export type ScanChannel='news'|'article'|'guide';

export async function scanCatalogChannel(
  channel:ScanChannel,
  sourceIdMap:Record<string,string>={},
  limitPerSource=6,
){
  const sources=contentSourceCatalog.filter(source=>source.kind===channel && source.enabled!==false);
  return scanSourcesToDatabase(
    sources.map(source=>({
      source,
      sourceId:sourceIdMap[source.name]||sourceIdMap[source.url]||null,
    })),
    [],
    limitPerSource,
  );
}

export async function scanAllCatalogSources(sourceIdMap:Record<string,string>={},limitPerSource=5){
  const news=await scanCatalogChannel('news',sourceIdMap,limitPerSource);
  const article=await scanCatalogChannel('article',sourceIdMap,limitPerSource);
  const guide=await scanCatalogChannel('guide',sourceIdMap,limitPerSource);
  return {
    scannedSources:news.scannedSources+article.scannedSources+guide.scannedSources,
    fetchedItems:news.fetchedItems+article.fetchedItems+guide.fetchedItems,
    candidatesCreated:news.candidatesCreated+article.candidatesCreated+guide.candidatesCreated,
    duplicates:news.duplicates+article.duplicates+guide.duplicates,
    warnings:[...news.warnings,...article.warnings,...guide.warnings],
  };
}

export async function scanOneSource(sourceId: string, signal?: AbortSignal): Promise<SourceScanResult> {
  const source = contentSourceCatalog.find((item) => item.id === sourceId);
  if (!source) return { sourceId, status: 'skipped', found: 0, imported: 0, message: 'Kaynak bulunamadı.' };
  if (signal?.aborted) return { sourceId, status: 'skipped', found: 0, imported: 0, message: 'Tarama iptal edildi.' };
  markSourceScanStarted(sourceId);
  try {
    const batch = await scanSourcesToDatabase([{ source, sourceId: null }], [], 6);
    const result: SourceScanResult = {
      sourceId,
      status: batch.warnings.length ? 'skipped' : 'success',
      found: batch.fetchedItems,
      imported: batch.candidatesCreated,
      message: batch.warnings.join('; ') || 'Tarama tamamlandı.',
    };
    markSourceScanFinished(result);
    return result;
  } catch (error) {
    const result: SourceScanResult = { sourceId, status: 'error', found: 0, imported: 0, message: error instanceof Error ? error.message : String(error) };
    markSourceScanFinished(result);
    return result;
  }
}
export async function scanSourceGroup(kind?: ContentSourceKind, signal?: AbortSignal) {
  const sources = contentSourceCatalog.filter((item) => item.enabled && (!kind || item.kind === kind));
  const results: SourceScanResult[] = [];
  for (const source of sources) {
    if (signal?.aborted) break;
    results.push(await scanOneSource(source.id, signal));
  }
  return results;
}
