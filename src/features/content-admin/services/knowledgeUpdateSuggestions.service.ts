export type UpdateCandidate = {
  id: string;
  candidate_type: string;
  content_subtype?: string | null;
  title_suggested: string;
  short_summary?: string | null;
  body_draft?: string | null;
  structured_body?: Record<string, unknown> | null;
  suggested_category?: string | null;
  suggested_tags?: string[] | null;
  suggested_crops?: string[] | null;
  target_content_id?: string | null;
};

export type UpdateTarget = {
  id: string;
  content_type?: string | null;
  content_subtype?: string | null;
  title: string;
  excerpt?: string | null;
  body?: string | null;
  status?: string | null;
  category?: string | null;
  tags?: string[] | null;
  crop_tags?: string[] | null;
  updated_at?: string | null;
};

export type UpdateSuggestion = {
  target: UpdateTarget;
  score: number;
  reason: string;
};

type CandidateChannel = 'article' | 'guide';

const normalize = (value: unknown) =>
  String(value ?? '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokens = (value: unknown) =>
  new Set(
    normalize(value)
      .split(' ')
      .filter((token) => token.length >= 3),
  );

const intersectionRatio = (left: unknown, right: unknown) => {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size || !b.size) return 0;

  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }

  return intersection / Math.max(a.size, b.size);
};

const normalizedList = (values: unknown) =>
  Array.isArray(values)
    ? Array.from(new Set(values.map((item) => normalize(item)).filter(Boolean)))
    : [];

const listOverlap = (left: unknown, right: unknown) => {
  const a = normalizedList(left);
  const b = new Set(normalizedList(right));
  if (!a.length || !b.size) return 0;

  const matches = a.filter((item) => b.has(item)).length;
  return matches / Math.max(a.length, b.size);
};

const candidateChannel = (candidate: UpdateCandidate): CandidateChannel => {
  if (normalize(candidate.content_subtype) === 'article') return 'article';

  const structuredChannel = candidate.structured_body &&
    typeof candidate.structured_body === 'object'
      ? normalize(candidate.structured_body.channel)
      : '';

  return structuredChannel === 'article' ? 'article' : 'guide';
};

const targetChannel = (target: UpdateTarget): CandidateChannel =>
  normalize(target.content_subtype) === 'article' ? 'article' : 'guide';

const isCompatibleTarget = (candidate: UpdateCandidate, target: UpdateTarget) => {
  if (candidate.candidate_type === 'news') return false;
  if (normalize(target.content_type || 'knowledge') !== 'knowledge') return false;
  if (target.status && normalize(target.status) !== 'published') return false;
  return candidateChannel(candidate) === targetChannel(target);
};

const scoreTarget = (candidate: UpdateCandidate, target: UpdateTarget) => {
  const candidateTitle = normalize(candidate.title_suggested);
  const targetTitle = normalize(target.title);

  if (!candidateTitle || !targetTitle) return { score: 0, reasons: [] as string[] };

  const reasons: string[] = [];
  let score = 0;

  if (candidateTitle === targetTitle) {
    score += 0.72;
    reasons.push('aynı başlık');
  } else {
    const titleScore = intersectionRatio(candidateTitle, targetTitle);
    score += titleScore * 0.58;
    if (titleScore >= 0.5) reasons.push('başlık benzerliği');
  }

  const cropScore = listOverlap(candidate.suggested_crops, target.crop_tags);
  if (cropScore > 0) {
    score += 0.2 * cropScore;
    reasons.push('aynı ürün');
  }

  const tagScore = listOverlap(candidate.suggested_tags, target.tags);
  if (tagScore > 0) {
    score += 0.12 * tagScore;
    reasons.push('ortak konu etiketi');
  }

  const candidateCategory = normalize(candidate.suggested_category);
  const targetCategory = normalize(target.category);
  if (candidateCategory && targetCategory && candidateCategory === targetCategory) {
    score += 0.06;
    reasons.push('aynı kategori');
  }

  const candidateText = `${candidate.short_summary ?? ''} ${candidate.body_draft ?? ''}`;
  const targetText = `${target.excerpt ?? ''} ${target.body ?? ''}`;
  const bodyScore = intersectionRatio(candidateText.slice(0, 2500), targetText.slice(0, 2500));
  if (bodyScore >= 0.28) {
    score += Math.min(0.08, bodyScore * 0.08);
    reasons.push('metin benzerliği');
  }

  return {
    score: Math.min(1, Number(score.toFixed(3))),
    reasons,
  };
};

/**
 * Admin kuyruğundaki bir bilgi/makale adayı için yayındaki olası güncelleme
 * hedeflerini önerir. Haberler hiçbir zaman bilgi kartı güncelleme hedefi
 * olarak değerlendirilmez. Makale yalnız makaleyle, Bilgi Rehberi yalnız
 * rehber/genel bilgi kartıyla eşleşir.
 */
export function suggestKnowledgeUpdates(
  candidate: UpdateCandidate,
  targets: UpdateTarget[],
): UpdateSuggestion[] {
  if (candidate.candidate_type === 'news') return [];

  const suggestions = targets
    .filter((target) => isCompatibleTarget(candidate, target))
    .map((target) => {
      const { score, reasons } = scoreTarget(candidate, target);
      return {
        target,
        score,
        reason: reasons.length
          ? `${Math.round(score * 100)}% eşleşme · ${reasons.join(' + ')}`
          : `${Math.round(score * 100)}% eşleşme`,
      } satisfies UpdateSuggestion;
    })
    .filter((item) => item.score >= 0.42 || item.target.id === candidate.target_content_id)
    .sort((a, b) => {
      if (a.target.id === candidate.target_content_id) return -1;
      if (b.target.id === candidate.target_content_id) return 1;
      return b.score - a.score;
    });

  return suggestions.slice(0, 5);
}

/**
 * Yayınlama anında seçilen güncelleme hedefini yeniden doğrular.
 * Böylece ekranda eski kalan veya yanlış kanal türüne ait bir kartın üzerine
 * yanlışlıkla yazılmaz.
 */
export function validateUpdateTarget(
  candidate: UpdateCandidate,
  visibleTarget: UpdateTarget | undefined,
  currentTarget: UpdateTarget | null | undefined,
): asserts currentTarget is UpdateTarget {
  if (candidate.candidate_type !== 'knowledge_update') return;

  if (!candidate.target_content_id) {
    throw new Error('Önce güncellenecek bilgi kartını seç.');
  }

  if (!currentTarget || currentTarget.id !== candidate.target_content_id) {
    throw new Error('Güncellenecek bilgi kartı bulunamadı. Listeyi yenileyip tekrar seç.');
  }

  if (normalize(currentTarget.content_type || 'knowledge') !== 'knowledge') {
    throw new Error('Haber kaydı Bilgi Rehberi / Makale güncelleme hedefi olamaz.');
  }

  if (normalize(currentTarget.status || '') !== 'published') {
    throw new Error('Yalnız yayındaki bilgi kartları güncellenebilir.');
  }

  if (candidateChannel(candidate) !== targetChannel(currentTarget)) {
    throw new Error(
      candidateChannel(candidate) === 'article'
        ? 'Bilimsel makale yalnız başka bir makale kaydını güncelleyebilir.'
        : 'Bilgi Rehberi adayı yalnız Bilgi Rehberi kartını güncelleyebilir.',
    );
  }

  if (visibleTarget) {
    if (visibleTarget.id !== currentTarget.id) {
      throw new Error('Seçilen kart değişmiş. İçerik listesini yenileyip tekrar dene.');
    }

    if (
      visibleTarget.updated_at &&
      currentTarget.updated_at &&
      visibleTarget.updated_at !== currentTarget.updated_at
    ) {
      throw new Error('Bu bilgi kartı sen seçtikten sonra değişmiş. Yenileyip tekrar kontrol et.');
    }
  }
}
