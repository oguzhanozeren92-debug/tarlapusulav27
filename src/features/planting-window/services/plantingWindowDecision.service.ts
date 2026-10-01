import type {
  PlantingWindowDecisionResult,
  PlantingWindowScenario,
  PlantingWindowScenarioDecision,
  PlantingWindowScenarioKey,
  PlantingWindowStageExposure,
  WheatPlantingWindowResult,
} from '../types/plantingWindow';
import { fetchWheatPlantingWindowScenarios } from './plantingWindow.service';

const VERSION = '13.3' as const;
const COMPARISON_SPREAD_EPSILON = 8;

const METRICS = [
  { key: 'reproductiveFrost', weight: 0.28 },
  { key: 'reproductiveHeat', weight: 0.28 },
  { key: 'reproductiveDry', weight: 0.18 },
  { key: 'establishmentFrost', weight: 0.10 },
  { key: 'establishmentHeat', weight: 0.08 },
  { key: 'establishmentDry', weight: 0.08 },
] as const;

type MetricKey = (typeof METRICS)[number]['key'];
type MetricBag = Record<MetricKey, number | null>;

type ScoredScenario = {
  scenario: PlantingWindowScenario;
  metrics: MetricBag;
  exposureIndex: number | null;
};

function finite(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function stage(
  scenario: PlantingWindowScenario,
  key: 'establishment' | 'reproductive',
): PlantingWindowStageExposure | null {
  return scenario.escapeCalendar.stages.find((item) => item.stage === key) ?? null;
}

function metricsForScenario(scenario: PlantingWindowScenario): MetricBag {
  const establishment = stage(scenario, 'establishment');
  const reproductive = stage(scenario, 'reproductive');

  return {
    reproductiveFrost: finite(reproductive?.frostSeasonFrequencyPercent),
    reproductiveHeat: finite(reproductive?.heatSeasonFrequencyPercent),
    reproductiveDry: finite(reproductive?.meanLongestDrySpellDays),
    establishmentFrost: finite(establishment?.frostSeasonFrequencyPercent),
    establishmentHeat: finite(establishment?.heatSeasonFrequencyPercent),
    establishmentDry: finite(establishment?.meanLongestDrySpellDays),
  };
}

function metricRange(
  rows: Array<{ metrics: MetricBag }>,
  key: MetricKey,
): { min: number; max: number } | null {
  const values = rows
    .map((row) => row.metrics[key])
    .filter((value): value is number => value != null);

  if (values.length < 2) return null;
  return {
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function normalizedExposure(
  value: number | null,
  range: { min: number; max: number } | null,
): number | null {
  if (value == null || !range) return null;
  const span = range.max - range.min;
  if (span <= 0) return 0;
  return (value - range.min) / span;
}

function scoreScenarios(scenarios: PlantingWindowScenario[]): ScoredScenario[] {
  const base = scenarios.map((scenario) => ({
    scenario,
    metrics: metricsForScenario(scenario),
  }));

  const ranges = Object.fromEntries(
    METRICS.map(({ key }) => [key, metricRange(base, key)]),
  ) as Record<MetricKey, { min: number; max: number } | null>;

  return base.map((row) => {
    let weighted = 0;
    let usedWeight = 0;

    for (const metric of METRICS) {
      const normalized = normalizedExposure(row.metrics[metric.key], ranges[metric.key]);
      if (normalized == null) continue;
      weighted += normalized * metric.weight;
      usedWeight += metric.weight;
    }

    return {
      ...row,
      exposureIndex: usedWeight > 0
        ? round1((weighted / usedWeight) * 100)
        : null,
    };
  });
}

function signedPercentPointText(delta: number, label: string) {
  if (Math.abs(delta) < 10) return null;
  const direction = delta < 0 ? 'daha düşük' : 'daha yüksek';
  return `${label} referans senaryoya göre ${Math.abs(Math.round(delta))} yüzde puan ${direction}.`;
}

function signedDayText(delta: number, label: string) {
  if (Math.abs(delta) < 1) return null;
  const direction = delta < 0 ? 'daha kısa' : 'daha uzun';
  return `${label} referans senaryoya göre ${Math.abs(round1(delta))} gün ${direction}.`;
}

function tradeoffsAgainstAnchor(
  row: ScoredScenario,
  anchor: ScoredScenario | null,
): string[] {
  if (!anchor || row.scenario.key === 'anchor') {
    const reproductive = stage(row.scenario, 'reproductive');
    if (!reproductive) return ['Üreme dönemi için karşılaştırılabilir fenoloji maruziyeti oluşmadı.'];
    return [
      `Üreme döneminde 0 °C ve altı gün görülen sezon sıklığı %${reproductive.frostSeasonFrequencyPercent ?? '—'}.`,
      `Üreme döneminde 30 °C ve üstü gün görülen sezon sıklığı %${reproductive.heatSeasonFrequencyPercent ?? '—'}.`,
      `Üreme dönemindeki ortalama en uzun kuru seri ${reproductive.meanLongestDrySpellDays ?? '—'} gün.`,
    ];
  }

  const rows = [
    row.metrics.reproductiveFrost != null && anchor.metrics.reproductiveFrost != null
      ? signedPercentPointText(
          row.metrics.reproductiveFrost - anchor.metrics.reproductiveFrost,
          'Üreme dönemi don maruziyeti',
        )
      : null,
    row.metrics.reproductiveHeat != null && anchor.metrics.reproductiveHeat != null
      ? signedPercentPointText(
          row.metrics.reproductiveHeat - anchor.metrics.reproductiveHeat,
          'Üreme dönemi sıcaklık maruziyeti',
        )
      : null,
    row.metrics.reproductiveDry != null && anchor.metrics.reproductiveDry != null
      ? signedDayText(
          row.metrics.reproductiveDry - anchor.metrics.reproductiveDry,
          'Üreme dönemi kuru seri',
        )
      : null,
    row.metrics.establishmentFrost != null && anchor.metrics.establishmentFrost != null
      ? signedPercentPointText(
          row.metrics.establishmentFrost - anchor.metrics.establishmentFrost,
          'Çıkış/yerleşme don maruziyeti',
        )
      : null,
    row.metrics.establishmentHeat != null && anchor.metrics.establishmentHeat != null
      ? signedPercentPointText(
          row.metrics.establishmentHeat - anchor.metrics.establishmentHeat,
          'Çıkış/yerleşme sıcaklık maruziyeti',
        )
      : null,
    row.metrics.establishmentDry != null && anchor.metrics.establishmentDry != null
      ? signedDayText(
          row.metrics.establishmentDry - anchor.metrics.establishmentDry,
          'Çıkış/yerleşme kuru seri',
        )
      : null,
  ].filter((item): item is string => Boolean(item));

  return rows.length
    ? rows.slice(0, 4)
    : ['Referans senaryoya göre belirgin meteorolojik fark oluşmadı.'];
}

function scenarioPosition(
  index: number | null,
  scored: ScoredScenario[],
): PlantingWindowScenarioDecision['relativeExposure'] {
  const values = scored
    .map((item) => item.exposureIndex)
    .filter((value): value is number => value != null)
    .sort((a, b) => a - b);

  if (index == null || values.length < 2) return 'unknown';
  const spread = values[values.length - 1] - values[0];
  if (spread < COMPARISON_SPREAD_EPSILON) return 'similar';
  if (index === values[0]) return 'lower';
  if (index === values[values.length - 1]) return 'higher';
  return 'middle';
}

function headlineForScenario(
  relativeExposure: PlantingWindowScenarioDecision['relativeExposure'],
) {
  if (relativeExposure === 'lower') return 'Üç tarih içinde daha düşük tarihsel maruziyet';
  if (relativeExposure === 'higher') return 'Üç tarih içinde daha yüksek tarihsel maruziyet';
  if (relativeExposure === 'middle') return 'Tarihsel maruziyet karşılaştırmasında orta sırada';
  if (relativeExposure === 'similar') return 'Diğer tarihlerle benzer tarihsel maruziyet';
  return 'Karşılaştırma için veri eksik';
}

function scenarioDecision(
  row: ScoredScenario,
  scored: ScoredScenario[],
  anchor: ScoredScenario | null,
): PlantingWindowScenarioDecision {
  const relativeExposure = scenarioPosition(row.exposureIndex, scored);
  return {
    key: row.scenario.key,
    label: row.scenario.label,
    plantingDate: row.scenario.plantingDate,
    relativeExposureIndex: row.exposureIndex,
    relativeExposure,
    headline: headlineForScenario(relativeExposure),
    tradeoffs: tradeoffsAgainstAnchor(row, anchor),
    evidence: [
      ...row.scenario.escapeCalendar.evidence,
      ...row.scenario.evidence,
    ].filter(Boolean).slice(0, 6),
  };
}

function lowerExposureScenario(
  decisions: PlantingWindowScenarioDecision[],
): PlantingWindowScenarioDecision | null {
  const comparable = decisions
    .filter((item) => item.relativeExposureIndex != null)
    .sort((a, b) => (a.relativeExposureIndex ?? 999) - (b.relativeExposureIndex ?? 999));
  if (!comparable.length) return null;
  if (comparable.length > 1) {
    const gap = (comparable[1].relativeExposureIndex ?? 0) - (comparable[0].relativeExposureIndex ?? 0);
    if (gap < COMPARISON_SPREAD_EPSILON) return null;
  }
  return comparable[0];
}

function unsupportedResult(
  source: WheatPlantingWindowResult,
): PlantingWindowDecisionResult {
  return {
    version: VERSION,
    sourceVersion: source.version,
    fieldId: source.fieldId,
    crop: source.crop,
    supported: source.supported,
    status: source.status === 'unsupported' ? 'unsupported' : 'needs_data',
    comparisonBasis: 'relative_historical_exposure',
    scenarios: [],
    lowerHistoricalExposureScenarioKey: null,
    summary: source.note,
    actionContext: 'Gerçek ekim geçmişi, yerel tarla koşulları ve kısa vadeli hava tamamlanmadan ekim tarihi kararı üretme.',
    evidence: [],
    guardrails: {
      lowerExposureIsNotRecommendation: true,
      noYieldBenefitClaim: true,
      noDiseaseDiagnosisFromWeather: true,
      realPlantingRecordNeverOverwritten: true,
      relativeIndexIsNotRiskProbability: true,
    },
    missingInputs: source.missingInputs,
    generatedAt: new Date().toISOString(),
  };
}

export function buildPlantingWindowDecision(
  source: WheatPlantingWindowResult,
): PlantingWindowDecisionResult {
  if (!source.supported || source.status === 'unsupported' || source.scenarios.length < 2) {
    return unsupportedResult(source);
  }

  const readyScenarios = source.scenarios.filter(
    (scenario) => scenario.escapeCalendar.status === 'ready',
  );
  if (readyScenarios.length < 2) return unsupportedResult(source);

  const scored = scoreScenarios(readyScenarios);
  const anchor = scored.find((item) => item.scenario.key === 'anchor') ?? null;
  const decisions = scored.map((row) => scenarioDecision(row, scored, anchor));
  const lower = lowerExposureScenario(decisions);

  const anchorDecision = decisions.find((item) => item.key === 'anchor') ?? null;
  const lowerText = lower
    ? `${lower.label} (${lower.plantingDate}) üç tarih içinde daha düşük birleşik tarihsel meteorolojik maruziyet gösteriyor.`
    : 'Üç tarih arasında belirgin tek bir düşük-maruz-kalan senaryo oluşmadı; farklar ticaret-off olarak değerlendirilmelidir.';
  const anchorText = anchorDecision?.tradeoffs?.[0]
    ? `Referans senaryo: ${anchorDecision.tradeoffs[0]}`
    : '';

  return {
    version: VERSION,
    sourceVersion: source.version,
    fieldId: source.fieldId,
    crop: source.crop,
    supported: true,
    status: 'ready',
    comparisonBasis: 'relative_historical_exposure',
    scenarios: decisions,
    lowerHistoricalExposureScenarioKey: lower?.key ?? null,
    summary: `${lowerText} ${anchorText}`.trim(),
    actionContext: 'Bu karşılaştırmayı toprak tavı, gerçek çeşit, ekim hazırlığı ve kısa vadeli hava ile birlikte değerlendir; tek başına ekim tarihi tavsiyesi olarak kullanma.',
    evidence: [
      `${source.anchor.historicalPlantingCount} gerçek ekim kaydından tarih referansı oluşturuldu.`,
      source.seasonDuration.days
        ? `${source.seasonDuration.historicalDurationCount} gerçek tamamlanmış sezon kaydından ${source.seasonDuration.days} günlük fenoloji ölçeği kullanıldı.`
        : 'Gerçek sezon süresi yok; fenoloji karşılaştırması sınırlı.',
      'Karşılaştırma indeksi üç senaryo içindeki göreli don, sıcaklık ve kuru-seri maruziyetlerinden üretilir; risk olasılığı değildir.',
      ...decisions.flatMap((item) => item.tradeoffs.slice(0, 1)),
    ].filter(Boolean).slice(0, 7),
    guardrails: {
      lowerExposureIsNotRecommendation: true,
      noYieldBenefitClaim: true,
      noDiseaseDiagnosisFromWeather: true,
      realPlantingRecordNeverOverwritten: true,
      relativeIndexIsNotRiskProbability: true,
    },
    missingInputs: source.missingInputs,
    generatedAt: new Date().toISOString(),
  };
}

export async function fetchWheatPlantingWindowDecision(
  fieldId: string | number,
  options: { forceRefresh?: boolean } = {},
): Promise<PlantingWindowDecisionResult> {
  const source = await fetchWheatPlantingWindowScenarios(fieldId, options);
  return buildPlantingWindowDecision(source);
}

export function compactPlantingWindowDecisionForPusula(
  value: PlantingWindowDecisionResult | null | undefined,
) {
  if (!value) return null;
  return {
    version: value.version,
    status: value.status,
    crop: value.crop,
    comparisonBasis: value.comparisonBasis,
    lowerHistoricalExposureScenarioKey: value.lowerHistoricalExposureScenarioKey,
    summary: value.summary,
    actionContext: value.actionContext,
    scenarios: value.scenarios.map((scenario) => ({
      key: scenario.key,
      label: scenario.label,
      plantingDate: scenario.plantingDate,
      relativeExposureIndex: scenario.relativeExposureIndex,
      relativeExposure: scenario.relativeExposure,
      headline: scenario.headline,
      tradeoffs: scenario.tradeoffs.slice(0, 3),
    })),
    evidence: value.evidence.slice(0, 5),
    guardrails: value.guardrails,
    generatedAt: value.generatedAt,
  };
}
