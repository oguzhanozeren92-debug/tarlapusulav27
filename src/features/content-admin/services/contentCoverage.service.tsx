export const COVERAGE_TOPICS = [
  { id: 'growing', label: 'Yetiştiricilik', aliases: ['growing', 'yetistiricilik', 'bitkisel uretim', 'cultivation'] },
  { id: 'disease', label: 'Hastalık', aliases: ['disease', 'hastalik', 'hastaliklar', 'hastaliklari'] },
  { id: 'pest', label: 'Zararlı', aliases: ['pest', 'zararli', 'zararlilar', 'zararlilari'] },
  { id: 'weed', label: 'Yabancı Ot', aliases: ['weed', 'weeds', 'yabanci ot', 'yabanci otlar'] },
  { id: 'nutrition', label: 'Besin Eksikliği', aliases: ['nutrition', 'besin eksikligi', 'besin eksiklikleri', 'nutrient deficiency'] },
  { id: 'irrigation', label: 'Sulama', aliases: ['irrigation', 'sulama'] },
  { id: 'fertilization', label: 'Gübreleme', aliases: ['fertilization', 'fertilisation', 'gubreleme'] },
  { id: 'soil', label: 'Toprak', aliases: ['soil', 'toprak'] },
  { id: 'harvest_storage', label: 'Hasat–Depolama', aliases: ['harvest storage', 'harvest', 'storage', 'hasat', 'depolama'] },
] as const;

export type CoverageScope = 'guide' | 'article' | 'all';
export type CoverageTopic = typeof COVERAGE_TOPICS[number];
export type CoverageCandidate = {
  id: string; candidate_type: string; content_subtype: string | null; workflow_status: string;
  suggested_category: string | null; suggested_tags?: string[] | null; suggested_crops?: string[] | null;
};
export type CoveragePublication = {
  id: string; content_type: string; content_subtype: string | null; status: string;
  category: string | null; tags?: string[] | null; crop_tags?: string[] | null;
};
export type CoverageRow = {
  topic: CoverageTopic;
  publishedIds: string[];
  candidateIds: string[];
  state: 'covered' | 'awaiting-review' | 'not-found';
};

const normalize = (value: string) => value.toLocaleLowerCase('tr-TR').normalize('NFD')
  .replace(/\p{M}/gu, '').replace(/ı/g, 'i').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const tags = (values?: string[] | null) => (Array.isArray(values) ? values : []).filter((value) => typeof value === 'string' && value.trim());
const inScope = (subtype: string | null, scope: CoverageScope) => scope === 'all' || (scope === 'article' ? subtype === 'article' : subtype !== 'article');
const hasCrop = (values: string[] | null | undefined, crop: string) => !normalize(crop) || tags(values).some((value) => normalize(value) === normalize(crop));

/** Yalnız açık kategori/etiketler sayılır; başlık veya gövdeden konu uydurulmaz. */
export function coverageTopicIds(category: string | null, topicTags?: string[] | null): string[] {
  const labels = [category ?? '', ...tags(topicTags)].map((value) => ` ${normalize(value)} `);
  return COVERAGE_TOPICS.filter((topic) => topic.aliases.some((alias) => labels.some((label) => label.includes(` ${alias} `)))).map((topic) => topic.id);
}

export function buildContentCoverage(publications: CoveragePublication[], candidates: CoverageCandidate[], crop = '', scope: CoverageScope = 'guide') {
  const published = publications.filter((item) => item.content_type === 'knowledge' && item.status === 'published' && inScope(item.content_subtype, scope));
  const pending = candidates.filter((item) => item.candidate_type !== 'news' && ['pending', 'held'].includes(item.workflow_status) && inScope(item.content_subtype, scope));
  const cropOptions = new Map<string, string>();
  [...published.flatMap((item) => tags(item.crop_tags)), ...pending.flatMap((item) => tags(item.suggested_crops))].forEach((value) => {
    const key = normalize(value);
    if (key && !cropOptions.has(key)) cropOptions.set(key, value.trim());
  });
  const rows: CoverageRow[] = COVERAGE_TOPICS.map((topic) => ({ topic, publishedIds: [], candidateIds: [], state: 'not-found' }));
  let unclassified = 0;
  for (const [kind, items] of [
    ['published', published.map((item) => ({ id: item.id, category: item.category, topicTags: item.tags, cropTags: item.crop_tags }))],
    ['candidate', pending.map((item) => ({ id: item.id, category: item.suggested_category, topicTags: item.suggested_tags, cropTags: item.suggested_crops }))],
  ] as const) {
    const seen = new Set<string>();
    for (const item of items) {
      if (!item.id || seen.has(item.id) || !hasCrop(item.cropTags, crop)) continue;
      seen.add(item.id);
      const topicIds = coverageTopicIds(item.category, item.topicTags);
      if (!topicIds.length) unclassified++;
      for (const row of rows) if (topicIds.includes(row.topic.id)) {
        (kind === 'published' ? row.publishedIds : row.candidateIds).push(item.id);
      }
    }
  }
  for (const row of rows) row.state = row.publishedIds.length ? 'covered' : row.candidateIds.length ? 'awaiting-review' : 'not-found';
  return {
    rows,
    cropOptions: [...cropOptions.values()].sort((a, b) => a.localeCompare(b, 'tr')),
    unclassified,
    untaggedCropCount: new Set([
      ...published.filter((item) => !tags(item.crop_tags).length).map((item) => `p:${item.id}`),
      ...pending.filter((item) => !tags(item.suggested_crops).length).map((item) => `c:${item.id}`),
    ]).size,
  };
}
