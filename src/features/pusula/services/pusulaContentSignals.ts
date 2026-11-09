/**
 * Published agricultural content -> precise, crop-scoped Pusula event.
 * This is an in-app signal only. It does not request push permission,
 * invent relevance from an untagged article, or publish any content.
 */
export type PusulaPublication = {
  id: string;
  content_type?: string | null;
  content_subtype?: string | null;
  title?: string | null;
  crop_tags?: string[] | null;
  published_at?: string | null;
  source_refs?: Array<{ source_name?: string | null }> | null;
};

export type PusulaContentSignal = {
  id: string;
  kind: 'article' | 'news';
  title: string;
  crop: string;
  publishedAt: string;
  source: string | null;
  screen: 'agendaHub';
};

const cropAliases: Record<string, string> = {
  'wheat': 'buğday', 'bugday': 'buğday', 'buğday': 'buğday',
  'grape': 'üzüm', 'grapes': 'üzüm', 'vine': 'üzüm', 'grapevine': 'üzüm', 'asma': 'üzüm', 'uzum': 'üzüm', 'üzüm': 'üzüm',
  'apple': 'elma', 'elma': 'elma',
  'cherry': 'kiraz', 'kiraz': 'kiraz',
  'hazelnut': 'fındık', 'findik': 'fındık', 'fındık': 'fındık',
  'olive': 'zeytin', 'zeytin': 'zeytin',
  'corn': 'mısır', 'maize': 'mısır', 'misir': 'mısır', 'mısır': 'mısır',
  'cotton': 'pamuk', 'pamuk': 'pamuk',
  'sunflower': 'ayçiçeği', 'aycicegi': 'ayçiçeği', 'ayçiçeği': 'ayçiçeği',
  'barley': 'arpa', 'arpa': 'arpa',
  'tomato': 'domates', 'domates': 'domates',
  'potato': 'patates', 'patates': 'patates',
};

export function normalizeCropForContent(input: unknown): string {
  const cleaned = String(input ?? '')
    .normalize('NFKC').trim().toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ').replace(/\s*\([^)]*\)\s*/g, '').trim();
  if (!cleaned || /^(ürün belirtilmedi|urun belirtilmedi|bilinmiyor|tüm gıdalar|tüm ürünler)$/.test(cleaned)) return '';
  const ascii = cleaned.replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ş/g, 's')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');
  return cropAliases[cleaned] || cropAliases[ascii] || cleaned;
}

export function latestCropPublication(
  rows: PusulaPublication[],
  cropName: string,
  now = new Date(),
): PusulaContentSignal | null {
  const crop = normalizeCropForContent(cropName);
  if (!crop) return null;
  const clock = now.getTime();
  const maxAge = 14 * 24 * 60 * 60 * 1000;
  const matching = rows.flatMap((row) => {
    const id = String(row.id ?? '').trim();
    const title = String(row.title ?? '').trim();
    const timestamp = Date.parse(String(row.published_at ?? ''));
    if (!id || !title || !Number.isFinite(timestamp) ||
        timestamp > clock + 60_000 || clock - timestamp > maxAge) return [];
    // Never infer crop relevance from title alone.
    if (!Array.isArray(row.crop_tags) || !row.crop_tags.some((tag) =>
      normalizeCropForContent(tag) === crop)) return [];
    const kind = row.content_subtype === 'article' ? 'article'
      : row.content_type === 'news' ? 'news' : null;
    if (!kind) return [];
    return [{
      id, title: title.slice(0, 180), crop,
      kind, publishedAt: String(row.published_at), screen: 'agendaHub' as const,
      source: String(row.source_refs?.[0]?.source_name ?? '').trim() || null,
    }];
  });
  return matching.sort((a,b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))[0] ?? null;
}

export function publicationSignalSeenKey(userId: string, fieldId: string, contentId: string) {
  return ['tp_pusula_publication_seen_v1', userId, fieldId, contentId]
    .map((part) => encodeURIComponent(String(part))).join(':');
}
