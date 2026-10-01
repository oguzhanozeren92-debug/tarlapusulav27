import type { NormalizedSourceItem } from './contentSourceNormalizer.service';

const fold = (v: string) => v.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9çğıöşü ]/gi, ' ').replace(/\s+/g, ' ').trim();
const words = (v: string) => new Set(fold(v).split(' ').filter(w => w.length > 2));

export function titleSimilarity(a: string, b: string) {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return 0;
  let same = 0; A.forEach(w => { if (B.has(w)) same += 1; });
  return same / Math.max(A.size, B.size);
}

export function dedupeNormalizedItems(items: NormalizedSourceItem[], titleThreshold = 0.82) {
  const kept: NormalizedSourceItem[] = [];
  for (const item of items) {
    const duplicate = kept.find(x => x.url === item.url || titleSimilarity(x.title, item.title) >= titleThreshold);
    if (!duplicate) kept.push(item);
    else {
      duplicate.sourceConfidence = Math.max(duplicate.sourceConfidence, item.sourceConfidence);
      duplicate.producerValue = Math.max(duplicate.producerValue, item.producerValue);
      duplicate.cropTags = [...new Set([...duplicate.cropTags, ...item.cropTags])];
      duplicate.regionTags = [...new Set([...duplicate.regionTags, ...item.regionTags])];
      duplicate.topicTags = [...new Set([...duplicate.topicTags, ...item.topicTags])];
      duplicate.guideCategories = [...new Set([...duplicate.guideCategories, ...item.guideCategories])];
    }
  }
  return kept;
}
