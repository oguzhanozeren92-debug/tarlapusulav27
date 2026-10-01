import type { OrchardIntelligenceSnapshot, OrchardTreeLoadLevel } from '../../orchard/types/orchardTree';
import type { FruitLoadDistribution, FruitLoadRadarSnapshot } from '../types/fruitLoadRadar';

const LOAD_SCORE: Record<OrchardTreeLoadLevel, number | null> = {
  none: 0,
  low: 0.25,
  medium: 0.5,
  high: 0.75,
  very_high: 1,
  unknown: null,
};

function finite(values: Array<number | null | undefined>) {
  return values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
}

function levelFromScore(score: number | null): OrchardTreeLoadLevel {
  if (score === null) return 'unknown';
  if (score < 0.1) return 'none';
  if (score < 0.35) return 'low';
  if (score < 0.65) return 'medium';
  if (score < 0.85) return 'high';
  return 'very_high';
}

function distributionOf(values: OrchardTreeLoadLevel[]): FruitLoadDistribution {
  const result: FruitLoadDistribution = {
    none: 0,
    low: 0,
    medium: 0,
    high: 0,
    very_high: 0,
    unknown: 0,
  };
  for (const value of values) result[value] += 1;
  return result;
}

export function buildFruitLoadRadarSnapshot(
  orchard: OrchardIntelligenceSnapshot,
): FruitLoadRadarSnapshot {
  const observations = orchard.latestObservations;
  const loadValues = observations.map((item) => item.fruitLoad);
  const scoredLoads = finite(loadValues.map((item) => LOAD_SCORE[item]));
  const averageLoadScore = scoredLoads.length
    ? scoredLoads.reduce((sum, value) => sum + value, 0) / scoredLoads.length
    : null;
  const level = levelFromScore(averageLoadScore);

  const measuredCounts = finite(observations.map((item) => item.fruitCountMeasured));
  const measuredFruitCountTreeCount = measuredCounts.length;
  const measuredFruitCountSum = measuredCounts.length
    ? measuredCounts.reduce((sum, value) => sum + value, 0)
    : null;
  const measuredFruitCountMean = measuredCounts.length && measuredFruitCountSum !== null
    ? measuredFruitCountSum / measuredCounts.length
    : null;
  const measuredFruitCountMin = measuredCounts.length ? Math.min(...measuredCounts) : null;
  const measuredFruitCountMax = measuredCounts.length ? Math.max(...measuredCounts) : null;
  const sampleCoveragePct = orchard.treeCount
    ? Math.round((measuredFruitCountTreeCount / orchard.treeCount) * 100)
    : 0;

  // Bahçe toplamına kaba örneklem projeksiyonu ancak en az 5 gerçek sayılmış ağaç ve
  // toplam ağaçların en az %10'u örneklenmişse gösterilir. Bu bir istatistiksel güven
  // aralığı veya verim tahmini değildir; yalnız saha örnekleminin kaba ölçeklenmesidir.
  const projectionEligible = Boolean(
    orchard.treeCount > 0 &&
    measuredFruitCountTreeCount >= 5 &&
    sampleCoveragePct >= 10 &&
    measuredFruitCountMean !== null,
  );
  const projectedFruitCount = projectionEligible && measuredFruitCountMean !== null
    ? Math.round(measuredFruitCountMean * orchard.treeCount)
    : null;

  const fruitContextTreeCount = observations.filter((item) =>
    ['fruit_set', 'fruit_growth', 'maturation', 'harvest_window'].includes(item.stage) ||
    ['low', 'medium', 'high', 'very_high'].includes(item.fruitLoad) ||
    item.fruitCountMeasured !== null,
  ).length;

  const evidence = [
    orchard.treeCount ? `${orchard.treeCount} kayıtlı ağaç bahçe tabanında bulunuyor.` : '',
    observations.length ? `${observations.length} ağaçta güncel saha/sensör gözlemi var.` : '',
    fruitContextTreeCount ? `${fruitContextTreeCount} ağaçta meyve tutumu/yükü/sayımı bağlamı var.` : '',
    measuredFruitCountTreeCount
      ? `${measuredFruitCountTreeCount} ağaçta gerçek sayılmış meyve adedi kaydı var.`
      : '',
    projectionEligible
      ? `Gerçek sayım örneklemi bahçenin %${sampleCoveragePct}'ini kapsadığı için kaba bahçe-adedi projeksiyonu gösterilebilir.`
      : '',
    orchard.measuredYieldTreeCount
      ? `${orchard.measuredYieldTreeCount} ağaçta gerçek kg verim kaydı bulunuyor.`
      : '',
  ].filter(Boolean);

  const warnings = [
    measuredFruitCountTreeCount > 0 && !projectionEligible
      ? `Toplam meyve adedi projeksiyonu için en az 5 gerçek sayılmış ağaç ve en az %10 örneklem kapsamı gerekir; mevcut kapsam %${sampleCoveragePct}.`
      : '',
    orchard.stressedTreeCount || orchard.waterStressTreeCount
      ? 'Stres/su stresi meyve tutumu ve hasada kadar korunacak yükü etkileyebilir; sistem mevcut meyve sayısını otomatik azaltmaz.'
      : '',
    orchard.alternance.status === 'possible'
      ? 'Gerçek yıllık ağaç verimlerinde olası alternans örüntüsü var; mevcut yüksek/düşük meyve yükü tek başına gelecek sezonu kanıtlamaz.'
      : '',
    'Fotoğraftan otomatik meyve sayımı bu sürümde üretim otoritesi değildir. Radar gerçek ağaç gözlemi ve gerçek sayılmış adetleri temel alır.',
    'Meyve adedi, hasat kilogramı değildir. Meyve iriliği, dökülme ve hasat kaybı doğrulanmadan kg verim üretilmez.',
  ].filter(Boolean);

  return {
    fieldId: orchard.fieldId,
    crop: orchard.crop,
    status: !orchard.pilotEnabled
      ? 'not_applicable'
      : orchard.treeCount === 0
        ? 'empty'
        : fruitContextTreeCount === 0
          ? 'insufficient'
          : 'ready',
    level,
    treeCount: orchard.treeCount,
    observedTreeCount: observations.length,
    fruitContextTreeCount,
    distribution: distributionOf(loadValues),
    measuredFruitCountTreeCount,
    measuredFruitCountSum,
    measuredFruitCountMean,
    measuredFruitCountMin,
    measuredFruitCountMax,
    sampleCoveragePct,
    projectedFruitCount,
    projectionEligible,
    projectionReason: projectionEligible
      ? 'Gerçek ağaç sayımlarının kaba bahçe ölçeklemesi.'
      : 'Yeterli gerçek ağaç sayımı olmadan toplam meyve adedi tahmin edilmez.',
    measuredYieldTreeCount: orchard.measuredYieldTreeCount,
    stressTreeCount: orchard.stressedTreeCount,
    waterStressTreeCount: orchard.waterStressTreeCount,
    alternancePossible: orchard.alternance.status === 'possible',
    evidence,
    warnings,
    generatedAt: new Date().toISOString(),
  };
}
