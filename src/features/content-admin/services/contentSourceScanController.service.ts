import { contentSourceCatalog } from '../../knowledge/data/sources';
import { scanSourcesToDatabase } from './contentSourceScanner.service';

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
      sourceId:sourceIdMap[source.name]||sourceIdMap[source.baseUrl]||null,
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
