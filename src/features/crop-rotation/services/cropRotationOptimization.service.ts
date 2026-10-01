import {
  CROP_ROTATION_PROFILES,
  cropRotationProfileByKey,
  findCropRotationProfile,
} from '../data/cropRotationProfiles';
import type {
  CropRotationAlternative,
  CropRotationContext,
  CropRotationCropProfile,
  CropRotationPlan,
  CropRotationPlanYear,
  CropRotationPreferences,
  CropRotationScoreBreakdown,
} from '../types/cropRotation';

type CandidateState = {
  keys: string[];
  score: number;
};

const DEFAULT_PREFS: CropRotationPreferences = {
  horizonYears: 3,
  requiredCrops: [],
  excludedCrops: [],
  waterPolicy: 'auto',
  maxHighWaterYears: null,
};

const BEAM_WIDTH = 260;
const MAX_CANDIDATES = 12;

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function normalizePreferences(input: Partial<CropRotationPreferences> | null | undefined): CropRotationPreferences {
  const horizon = clampInt(input?.horizonYears, 3, 5, DEFAULT_PREFS.horizonYears) as 3 | 4 | 5;
  const requiredCrops = unique((input?.requiredCrops ?? [])
    .map((value) => findCropRotationProfile(value)?.key)
    .filter((value): value is string => Boolean(value)));
  const excludedCrops = unique((input?.excludedCrops ?? [])
    .map((value) => findCropRotationProfile(value)?.key)
    .filter((value): value is string => Boolean(value)))
    .filter((key) => !requiredCrops.includes(key));
  const waterPolicy = input?.waterPolicy === 'conservative' || input?.waterPolicy === 'unrestricted'
    ? input.waterPolicy
    : 'auto';
  const maxHighWaterYears = input?.maxHighWaterYears === null || input?.maxHighWaterYears === undefined
    ? null
    : clampInt(input.maxHighWaterYears, 0, horizon, horizon);

  return {
    horizonYears: horizon,
    requiredCrops,
    excludedCrops,
    waterPolicy,
    maxHighWaterYears,
  };
}

function candidatePool(context: CropRotationContext, preferences: CropRotationPreferences) {
  const priority = unique([
    context.currentCropKey,
    ...context.history.map((item) => item.cropKey),
    ...preferences.requiredCrops,
    'wheat',
    'barley',
    'chickpea',
    'lentil',
    'sunflower',
    'canola',
    'maize',
    'dry-bean',
    'soybean',
    'cotton',
    'sugar-beet',
    'potato',
    'rice',
  ].filter((value): value is string => Boolean(value)));

  const profiles = priority
    .map((key) => cropRotationProfileByKey(key))
    .filter((profile): profile is CropRotationCropProfile => Boolean(profile))
    .filter((profile) => !preferences.excludedCrops.includes(profile.key));

  return profiles.slice(0, MAX_CANDIDATES);
}

function latestKnownSequence(context: CropRotationContext) {
  const fromHistory = [...context.history]
    .sort((a, b) => a.year - b.year)
    .map((item) => item.cropKey)
    .filter((value): value is string => Boolean(value));

  if (context.currentCropKey && fromHistory.at(-1) !== context.currentCropKey) {
    fromHistory.push(context.currentCropKey);
  }

  return fromHistory;
}

function recentDiseaseForKey(context: CropRotationContext, key: string) {
  const profile = cropRotationProfileByKey(key);
  if (!profile) return [];
  return context.diseasePressure.filter((item) =>
    item.cropKey === key || (item.family !== 'unknown' && item.family === profile.family));
}

function economicsScore(context: CropRotationContext, cropKey: string) {
  const matching = context.economics.filter((item) => item.cropKey === cropKey);
  if (!matching.length) return 0;

  const all = context.economics.map((item) => item.observedNetMargin).filter(Number.isFinite);
  if (all.length < 2) return 0;

  const min = Math.min(...all);
  const max = Math.max(...all);
  if (min === max) return 0;

  const mean = matching.reduce((sum, item) => sum + item.observedNetMargin, 0) / matching.length;
  const normalized = (mean - min) / (max - min);
  return Math.round((normalized - 0.5) * 18);
}

function scoreStep(
  context: CropRotationContext,
  previousKeys: string[],
  candidate: CropRotationCropProfile,
  preferences: CropRotationPreferences,
): CropRotationScoreBreakdown {
  const prevKey = previousKeys.at(-1) ?? null;
  const prev2Key = previousKeys.at(-2) ?? null;
  const prev = prevKey ? cropRotationProfileByKey(prevKey) : null;
  const prev2 = prev2Key ? cropRotationProfileByKey(prev2Key) : null;

  let diversity = 0;
  if (prevKey === candidate.key) diversity -= 42;
  else if (prev?.family === candidate.family) diversity -= 18;
  else if (prev) diversity += 12;

  if (prev2Key === candidate.key) diversity -= 12;
  else if (prev2?.family === candidate.family) diversity -= 6;

  if (candidate.family === 'legume' && prev?.family === 'cereal') diversity += 8;
  if (candidate.family === 'cereal' && prev?.family === 'legume') diversity += 8;

  let water = 0;
  const rainfed = context.irrigationStatus === 'rainfed';
  const conservative = preferences.waterPolicy === 'conservative' ||
    (preferences.waterPolicy === 'auto' && rainfed);

  if (conservative) {
    if (candidate.waterDemand === 'high') water -= 26;
    if (candidate.waterDemand === 'medium') water -= 6;
    if (candidate.waterDemand === 'low') water += 8;
  } else if (context.irrigationStatus === 'irrigated') {
    if (candidate.waterDemand === 'high') water += 2;
  }

  let nitrogen = 0;
  if (context.labNitrogenSignal === 'low') {
    if (candidate.nitrogenRole === 'benefit') nitrogen += 14;
    if (candidate.nitrogenRole === 'demanding') nitrogen -= 8;
  } else if (candidate.nitrogenRole === 'benefit' && prev?.nitrogenRole === 'demanding') {
    nitrogen += 5;
  }

  let disease = 0;
  const recentDisease = recentDiseaseForKey(context, candidate.key);
  if (recentDisease.length) {
    disease -= Math.min(28, recentDisease.reduce((sum, item) => sum + (item.strength === 'high' ? 14 : 8), 0));
  }
  if (prevKey === candidate.key && recentDisease.length) disease -= 10;

  const economics = economicsScore(context, candidate.key);

  let constraints = 0;
  if (preferences.requiredCrops.includes(candidate.key)) constraints += 4;

  const total = diversity + water + nitrogen + disease + economics + constraints;
  return { diversity, water, nitrogen, disease, economics, constraints, total };
}

function highWaterCount(keys: string[]) {
  return keys.reduce((count, key) => {
    return count + (cropRotationProfileByKey(key)?.waterDemand === 'high' ? 1 : 0);
  }, 0);
}

function remainingRequired(keys: string[], required: string[]) {
  return required.filter((key) => !keys.includes(key));
}

function feasiblePartial(
  state: CandidateState,
  nextKey: string,
  yearIndex: number,
  preferences: CropRotationPreferences,
) {
  const keys = [...state.keys, nextKey];
  const remainingSlots = preferences.horizonYears - (yearIndex + 1);
  const missingRequired = remainingRequired(keys, preferences.requiredCrops);

  if (missingRequired.length > remainingSlots) return false;

  if (
    preferences.maxHighWaterYears !== null &&
    highWaterCount(keys) > preferences.maxHighWaterYears
  ) {
    return false;
  }

  return true;
}

function planYearReasons(
  context: CropRotationContext,
  previousKeys: string[],
  profile: CropRotationCropProfile,
  score: CropRotationScoreBreakdown,
) {
  const reasons: string[] = [];
  const cautions: string[] = [];
  const prev = cropRotationProfileByKey(previousKeys.at(-1) ?? '');

  if (prev && prev.family !== profile.family) {
    reasons.push(`Önceki ürün ailesinden farklı: ${prev.label} → ${profile.label}.`);
  }
  if (prev?.family === 'cereal' && profile.family === 'legume') {
    reasons.push('Tahıl sonrasında baklagil çeşitliliği sağlıyor.');
  }
  if (prev?.family === 'legume' && profile.family === 'cereal') {
    reasons.push('Baklagil sonrasında tahıl ile aile değişimi sağlıyor.');
  }
  if (score.water > 0 && profile.waterDemand === 'low') {
    reasons.push('Su baskısı düşük sınıfta olduğu için mevcut su kısıtına daha uyumlu.');
  }
  if (score.nitrogen > 0 && profile.nitrogenRole === 'benefit') {
    reasons.push('Baklagil sınıfı, azot dengesi açısından rotasyona olumlu bağlam ekliyor.');
  }
  if (score.economics > 0) {
    reasons.push('Kayıtlı gerçek ekonomik geçmişte göreli olarak güçlü görünüyor.');
  }
  if (context.preferences.requiredCrops.includes(profile.key)) {
    reasons.push('Kullanıcının zorunlu ürün kısıtını karşılıyor.');
  }

  if (score.disease < 0) {
    cautions.push('Bu ürün/ürün ailesiyle ilişkili yakın dönem saha hastalık kaydı var; ekim öncesi risk bağlamını tekrar kontrol et.');
  }
  if (score.water < 0 && profile.waterDemand === 'high') {
    cautions.push('Göreli su talebi yüksek; su bütçesi ve sulama erişimi doğrulanmadan kesinleştirme.');
  }
  if (prev?.key === profile.key) {
    cautions.push('Aynı ürün arka arkaya geliyor; hastalık, yabancı ot ve besin baskısını artırabileceği için plan puanı düşürüldü.');
  }
  if (!reasons.length) {
    reasons.push('Mevcut kısıtlar içinde ürün ailesi, su ve geçmiş kayıt dengesiyle seçildi.');
  }

  return { reasons: reasons.slice(0, 3), cautions: cautions.slice(0, 3) };
}

function buildPlanYears(
  context: CropRotationContext,
  keys: string[],
  startYear: number,
  preferences: CropRotationPreferences,
) {
  const known = latestKnownSequence(context);
  const result: CropRotationPlanYear[] = [];

  keys.forEach((key, index) => {
    const profile = cropRotationProfileByKey(key)!;
    const previousKeys = [...known, ...keys.slice(0, index)];
    const score = scoreStep(context, previousKeys, profile, preferences);
    const explanation = planYearReasons(context, previousKeys, profile, score);

    result.push({
      year: startYear + index,
      cropKey: profile.key,
      cropLabel: profile.label,
      family: profile.family,
      waterDemand: profile.waterDemand,
      nitrogenRole: profile.nitrogenRole,
      score,
      reasons: explanation.reasons,
      cautions: explanation.cautions,
    });
  });

  return result;
}

function alternatives(states: CandidateState[], startYear: number): CropRotationAlternative[] {
  return states.slice(1, 4).map((state, index) => ({
    id: `alternative-${index + 1}`,
    totalScore: state.score,
    crops: state.keys.map((key, yearIndex) => ({
      year: startYear + yearIndex,
      cropKey: key,
      cropLabel: cropRotationProfileByKey(key)?.label ?? key,
    })),
  }));
}

export function optimizeCropRotation(contextInput: CropRotationContext): CropRotationPlan {
  const preferences = normalizePreferences(contextInput.preferences);
  const context: CropRotationContext = { ...contextInput, preferences };
  const nowYear = new Date(context.generatedAt).getFullYear();
  const latestHistoryYear = context.history.reduce((max, item) => Math.max(max, item.year), 0);
  const startYear = Math.max(nowYear + 1, latestHistoryYear ? latestHistoryYear + 1 : nowYear + 1);

  const base = {
    version: '10.0' as const,
    fieldId: context.fieldId,
    generatedAt: context.generatedAt,
    horizonYears: preferences.horizonYears,
    startYear,
    historyYears: context.history.length,
    preferences,
    solver: {
      engine: 'deterministic-constraint-search' as const,
      contract: 'cp-sat-ready-v1' as const,
      productionAuthority: true as const,
      note: 'Canlı çözümleyici aynı kısıt/amaç sözleşmesini deterministik olarak çözer. OR-Tools CP-SAT server/shadow çözümleyici bu sözleşmeye sonradan takılabilir.',
    },
  };

  if (context.cropCycle === 'perennial') {
    return {
      ...base,
      status: 'not_applicable',
      summary: 'Bu tarla çok yıllık ürün olarak kayıtlı; yıllık ekim nöbeti planı uygulanmadı.',
      actionContext: 'Bahçe/ağaç yönetimi için ürün değiştirme yerine çok yıllık ürün motorunu kullan.',
      plan: [],
      alternatives: [],
      evidence: ['Tarla ürün tipi: çok yıllık.'],
      warnings: context.warnings,
    };
  }

  const candidates = candidatePool(context, preferences);
  if (!candidates.length) {
    return {
      ...base,
      status: 'no_feasible_plan',
      summary: 'Kısıtları karşılayan rotasyon adayı kalmadı.',
      actionContext: 'Zorunlu ve hariç ürün kısıtlarını gözden geçir.',
      plan: [],
      alternatives: [],
      evidence: [],
      warnings: [...context.warnings, 'Aday ürün havuzu boş.'],
    };
  }

  const missingRequiredProfiles = preferences.requiredCrops.filter(
    (key) => !candidates.some((candidate) => candidate.key === key),
  );
  if (missingRequiredProfiles.length) {
    return {
      ...base,
      status: 'no_feasible_plan',
      summary: 'Zorunlu ürün kısıtlarından en az biri aday havuzunda bulunamadı.',
      actionContext: 'Zorunlu ürün listesini desteklenen ürünlerle güncelle.',
      plan: [],
      alternatives: [],
      evidence: [],
      warnings: [...context.warnings, `Bulunamayan zorunlu ürün: ${missingRequiredProfiles.join(', ')}`],
    };
  }

  let states: CandidateState[] = [{ keys: [], score: 0 }];
  const known = latestKnownSequence(context);

  for (let yearIndex = 0; yearIndex < preferences.horizonYears; yearIndex += 1) {
    const expanded: CandidateState[] = [];

    for (const state of states) {
      const remainingSlotsAfterPick = preferences.horizonYears - (yearIndex + 1);
      const missingBeforePick = remainingRequired(state.keys, preferences.requiredCrops);
      const forcedRequired = missingBeforePick.length > remainingSlotsAfterPick;
      const yearCandidates = forcedRequired
        ? candidates.filter((candidate) => missingBeforePick.includes(candidate.key))
        : candidates;

      for (const candidate of yearCandidates) {
        if (!feasiblePartial(state, candidate.key, yearIndex, preferences)) continue;
        const previousKeys = [...known, ...state.keys];
        const breakdown = scoreStep(context, previousKeys, candidate, preferences);
        expanded.push({
          keys: [...state.keys, candidate.key],
          score: state.score + breakdown.total,
        });
      }
    }

    states = expanded
      .sort((a, b) => b.score - a.score || a.keys.join('|').localeCompare(b.keys.join('|')))
      .slice(0, BEAM_WIDTH);

    if (!states.length) break;
  }

  const complete = states
    .filter((state) => state.keys.length === preferences.horizonYears)
    .filter((state) => remainingRequired(state.keys, preferences.requiredCrops).length === 0)
    .sort((a, b) => b.score - a.score || a.keys.join('|').localeCompare(b.keys.join('|')));

  if (!complete.length) {
    return {
      ...base,
      status: 'no_feasible_plan',
      summary: 'Seçilen kısıtlarla uygulanabilir 3–5 yıllık plan bulunamadı.',
      actionContext: 'Zorunlu ürün, hariç ürün veya yüksek su isteyen ürün sınırını gevşet.',
      plan: [],
      alternatives: [],
      evidence: [],
      warnings: [...context.warnings, 'Kısıt kombinasyonu uygulanabilir plan bırakmadı.'],
    };
  }

  const winner = complete[0];
  const plan = buildPlanYears(context, winner.keys, startYear, preferences);
  const planLabel = plan.map((item) => `${item.year} ${item.cropLabel}`).join(' → ');
  const evidence = [
    `${context.history.length} kayıtlı sezon değerlendirildi.`,
    context.irrigationStatus === 'rainfed'
      ? 'Tarla kuru tarım olarak kayıtlı; yüksek su talebi göreli olarak cezalandırıldı.'
      : context.irrigationStatus === 'irrigated'
        ? 'Tarla sulu olarak kayıtlı; su baskısı tek başına adayları elemedi.'
        : 'Sulama durumu kısmi/belirsiz; su baskısı temkinli ağırlıkla kullanıldı.',
    context.diseasePressure.length
      ? `${context.diseasePressure.length} yakın dönem saha hastalık/zararlı kanıtı rotasyon puanına bağlandı.`
      : 'Yakın dönem saha hastalık baskısı kaydı bulunamadı; bu başlık puan üretmedi.',
    context.labNitrogenSignal === 'low'
      ? 'Son laboratuvar yorumunda düşük/eksik azot sinyali bulundu; baklagil sınıfı planlama bağlamında desteklendi.'
      : 'Doğrulanmış düşük azot sinyali yok; azot başlığı ürün seçimini zorlamadı.',
    context.economics.length
      ? 'Kayıtlı gerçek net marj/gelir kanıtı olan ürünlerde ekonomi skoru kullanıldı.'
      : 'Karşılaştırılabilir gerçek ekonomik kayıt yok; motor fiyat veya kâr uydurmadı.',
  ];

  return {
    ...base,
    status: context.history.length >= 2 ? 'ready' : 'needs_history',
    summary: context.history.length >= 2
      ? `Önerilen rotasyon: ${planLabel}. Plan ürün ailesi tekrarı, su baskısı, saha hastalık kayıtları, azot bağlamı ve varsa gerçek ekonomi kanıtını birlikte tarttı.`
      : `İlk rotasyon taslağı: ${planLabel}. Geçmiş sezon sayısı az olduğu için plan düşük veri olgunluğuyla üretildi.`,
    actionContext: 'Ekim kararı öncesinde seçilen ürünün bölgesel uygunluğunu, tohum/kontrat durumunu ve güncel su-toprak koşullarını doğrula.',
    plan,
    alternatives: alternatives(complete, startYear),
    evidence,
    warnings: context.warnings,
  };
}

export function normalizeCropRotationPreferences(
  input: Partial<CropRotationPreferences> | null | undefined,
) {
  return normalizePreferences(input);
}
