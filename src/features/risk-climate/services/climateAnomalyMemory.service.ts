import type { AgroClimateBaselineEvidence } from '../../../services/agroClimateBaseline.service';
import {
  readFieldMapLayerCache,
  writeFieldMapLayerCache,
} from '../../home-map/services/fieldMapLayerCache';
import type { WorldClimReference } from './worldClimReference.service';

export type ClimateAnomalySeasonState =
  | 'warmer_drier'
  | 'warmer_wetter'
  | 'cooler_drier'
  | 'cooler_wetter'
  | 'warmer'
  | 'cooler'
  | 'drier'
  | 'wetter'
  | 'near_normal'
  | 'unknown';

export type ClimateAnomalyTrend =
  | 'drying'
  | 'wetting'
  | 'warming'
  | 'cooling'
  | 'mixed'
  | 'stable'
  | 'unknown';

export type ClimateAnomalyMemorySnapshot = {
  dateKey: string;
  capturedAt: string;
  currentPeriod: { start: string; end: string } | null;
  windowDays: number | null;
  temperatureAnomalyC: number | null;
  precipitationDeficitPct: number | null;
  waterBalanceAnomalyMm: number | null;
  soilMoisture7To28Percentile: number | null;
  climateWaterStressClass: string | null;
  seasonState: ClimateAnomalySeasonState;
  sourceConfidence: 'low' | 'medium' | 'unknown';
  worldClimBaselinePeriod: '1970-2000' | null;
};

export type ClimateAnomalyMemory = {
  version: '1.0';
  fieldId: string;
  status: 'ready' | 'partial' | 'needs_data';
  latest: ClimateAnomalyMemorySnapshot | null;
  historyCount: number;
  history: ClimateAnomalyMemorySnapshot[];
  persistence: {
    warmSnapshots: number;
    coolSnapshots: number;
    drySnapshots: number;
    wetSnapshots: number;
    consecutiveDrySnapshots: number;
    consecutiveWarmSnapshots: number;
    persistentDry: boolean;
    persistentWarm: boolean;
  };
  trend: ClimateAnomalyTrend;
  summary: string;
  evidence: string[];
  guardrails: {
    oneSnapshotPerDay: true;
    worldClimIsContextNotMonthlyNormal: true;
    memoryDoesNotAlterShortTermRiskScore: true;
    noAnomalyWithoutBaselineEvidence: true;
  };
  generatedAt: string;
};

const CACHE_NAMESPACE = 'risk-climate-anomaly-memory-v1';
const CACHE_TTL_MS = 450 * 24 * 60 * 60 * 1000;
const MAX_HISTORY = 24;

function finite(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round(value: number | null, digits = 1) {
  return value == null ? null : Number(value.toFixed(digits));
}

function dateKey(value = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function cacheKey(fieldId: string) {
  return `${fieldId}:risk-climate-anomaly-memory-v1`;
}

function temperatureClass(anomaly: number | null) {
  if (anomaly == null) return 'unknown' as const;
  if (anomaly >= 0.7) return 'warm' as const;
  if (anomaly <= -0.7) return 'cool' as const;
  return 'normal' as const;
}

function moistureClass(input: {
  precipitationDeficitPct: number | null;
  waterBalanceAnomalyMm: number | null;
  soilMoisture7To28Percentile: number | null;
}) {
  const { precipitationDeficitPct, waterBalanceAnomalyMm, soilMoisture7To28Percentile } = input;

  const dryVotes = [
    precipitationDeficitPct != null && precipitationDeficitPct >= 20,
    waterBalanceAnomalyMm != null && waterBalanceAnomalyMm <= -20,
    soilMoisture7To28Percentile != null && soilMoisture7To28Percentile <= 30,
  ].filter(Boolean).length;

  const wetVotes = [
    precipitationDeficitPct != null && precipitationDeficitPct <= -20,
    waterBalanceAnomalyMm != null && waterBalanceAnomalyMm >= 20,
    soilMoisture7To28Percentile != null && soilMoisture7To28Percentile >= 70,
  ].filter(Boolean).length;

  if (dryVotes >= 2 || (dryVotes === 1 && wetVotes === 0)) return 'dry' as const;
  if (wetVotes >= 2 || (wetVotes === 1 && dryVotes === 0)) return 'wet' as const;
  if (dryVotes === 0 && wetVotes === 0) return 'normal' as const;
  return 'mixed' as const;
}

function seasonStateOf(input: {
  temperatureAnomalyC: number | null;
  precipitationDeficitPct: number | null;
  waterBalanceAnomalyMm: number | null;
  soilMoisture7To28Percentile: number | null;
}): ClimateAnomalySeasonState {
  const temp = temperatureClass(input.temperatureAnomalyC);
  const moisture = moistureClass(input);

  if (temp === 'warm' && moisture === 'dry') return 'warmer_drier';
  if (temp === 'warm' && moisture === 'wet') return 'warmer_wetter';
  if (temp === 'cool' && moisture === 'dry') return 'cooler_drier';
  if (temp === 'cool' && moisture === 'wet') return 'cooler_wetter';
  if (temp === 'warm') return 'warmer';
  if (temp === 'cool') return 'cooler';
  if (moisture === 'dry') return 'drier';
  if (moisture === 'wet') return 'wetter';
  if (temp === 'normal' && moisture === 'normal') return 'near_normal';
  return 'unknown';
}

function stateLabel(value: ClimateAnomalySeasonState) {
  const labels: Record<ClimateAnomalySeasonState, string> = {
    warmer_drier: 'normalden daha sıcak ve daha kuru',
    warmer_wetter: 'normalden daha sıcak ve daha yağışlı/nemli',
    cooler_drier: 'normalden daha serin ve daha kuru',
    cooler_wetter: 'normalden daha serin ve daha yağışlı/nemli',
    warmer: 'normalden daha sıcak',
    cooler: 'normalden daha serin',
    drier: 'normalden daha kuru',
    wetter: 'normalden daha yağışlı/nemli',
    near_normal: 'uzun dönem/karşılaştırma penceresine yakın',
    unknown: 'belirsiz',
  };
  return labels[value];
}

function isDry(state: ClimateAnomalySeasonState) {
  return state === 'warmer_drier' || state === 'cooler_drier' || state === 'drier';
}

function isWet(state: ClimateAnomalySeasonState) {
  return state === 'warmer_wetter' || state === 'cooler_wetter' || state === 'wetter';
}

function isWarm(state: ClimateAnomalySeasonState) {
  return state === 'warmer_drier' || state === 'warmer_wetter' || state === 'warmer';
}

function isCool(state: ClimateAnomalySeasonState) {
  return state === 'cooler_drier' || state === 'cooler_wetter' || state === 'cooler';
}

function consecutiveFromLatest(
  history: ClimateAnomalyMemorySnapshot[],
  predicate: (item: ClimateAnomalyMemorySnapshot) => boolean,
) {
  let count = 0;
  for (const item of history) {
    if (!predicate(item)) break;
    count += 1;
  }
  return count;
}

function deriveTrend(history: ClimateAnomalyMemorySnapshot[]): ClimateAnomalyTrend {
  if (history.length < 2) return 'unknown';
  const latest = history[0];
  const previous = history[1];

  const tempDelta =
    latest.temperatureAnomalyC != null && previous.temperatureAnomalyC != null
      ? latest.temperatureAnomalyC - previous.temperatureAnomalyC
      : null;

  const deficitDelta =
    latest.precipitationDeficitPct != null && previous.precipitationDeficitPct != null
      ? latest.precipitationDeficitPct - previous.precipitationDeficitPct
      : null;

  const waterDelta =
    latest.waterBalanceAnomalyMm != null && previous.waterBalanceAnomalyMm != null
      ? latest.waterBalanceAnomalyMm - previous.waterBalanceAnomalyMm
      : null;

  const drying =
    (deficitDelta != null && deficitDelta >= 8) ||
    (waterDelta != null && waterDelta <= -15);
  const wetting =
    (deficitDelta != null && deficitDelta <= -8) ||
    (waterDelta != null && waterDelta >= 15);
  const warming = tempDelta != null && tempDelta >= 0.5;
  const cooling = tempDelta != null && tempDelta <= -0.5;

  const active = [drying, wetting, warming, cooling].filter(Boolean).length;
  if (active >= 2 && !((drying && warming) || (wetting && cooling))) return 'mixed';
  if (drying) return 'drying';
  if (wetting) return 'wetting';
  if (warming) return 'warming';
  if (cooling) return 'cooling';
  return 'stable';
}

function snapshotFromInputs(
  agroClimate: AgroClimateBaselineEvidence | null | undefined,
  worldClim: WorldClimReference | null | undefined,
): ClimateAnomalyMemorySnapshot | null {
  const anomalies = agroClimate?.anomalies;
  const analysis = agroClimate?.analysis;

  if (!anomalies || !analysis) return null;

  const temperatureAnomalyC = round(finite(anomalies.temperatureAnomalyC));
  const precipitationDeficitPct = round(finite(anomalies.precipitationDeficitPct));
  const waterBalanceAnomalyMm = round(finite(anomalies.waterBalanceAnomalyMm));
  const soilMoisture7To28Percentile = round(finite(anomalies.soilMoisture7To28Percentile), 0);

  const usable = [
    temperatureAnomalyC,
    precipitationDeficitPct,
    waterBalanceAnomalyMm,
    soilMoisture7To28Percentile,
  ].filter((value) => value != null).length;

  if (!usable) return null;

  const capturedAt = new Date().toISOString();
  const seasonState = seasonStateOf({
    temperatureAnomalyC,
    precipitationDeficitPct,
    waterBalanceAnomalyMm,
    soilMoisture7To28Percentile,
  });

  return {
    dateKey: dateKey(),
    capturedAt,
    currentPeriod: analysis.currentPeriod
      ? {
          start: String(analysis.currentPeriod.start ?? ''),
          end: String(analysis.currentPeriod.end ?? ''),
        }
      : null,
    windowDays: finite(analysis.windowDays),
    temperatureAnomalyC,
    precipitationDeficitPct,
    waterBalanceAnomalyMm,
    soilMoisture7To28Percentile,
    climateWaterStressClass: agroClimate?.climateWaterStress?.class ?? null,
    seasonState,
    sourceConfidence:
      agroClimate?.climateWaterStress?.confidence === 'medium'
        ? 'medium'
        : agroClimate?.status === 'ready'
          ? 'low'
          : 'unknown',
    worldClimBaselinePeriod: worldClim?.status === 'ready' ? '1970-2000' : null,
  };
}

function buildMemory(
  fieldId: string,
  history: ClimateAnomalyMemorySnapshot[],
): ClimateAnomalyMemory {
  const latest = history[0] ?? null;
  const recent = history.slice(0, 6);

  const warmSnapshots = recent.filter((item) => isWarm(item.seasonState)).length;
  const coolSnapshots = recent.filter((item) => isCool(item.seasonState)).length;
  const drySnapshots = recent.filter((item) => isDry(item.seasonState)).length;
  const wetSnapshots = recent.filter((item) => isWet(item.seasonState)).length;
  const consecutiveDrySnapshots = consecutiveFromLatest(history, (item) => isDry(item.seasonState));
  const consecutiveWarmSnapshots = consecutiveFromLatest(history, (item) => isWarm(item.seasonState));

  const persistence = {
    warmSnapshots,
    coolSnapshots,
    drySnapshots,
    wetSnapshots,
    consecutiveDrySnapshots,
    consecutiveWarmSnapshots,
    persistentDry: consecutiveDrySnapshots >= 3 || drySnapshots >= 4,
    persistentWarm: consecutiveWarmSnapshots >= 3 || warmSnapshots >= 4,
  };

  const evidence: string[] = [];
  if (latest) {
    evidence.push(`Son kayıt: ${stateLabel(latest.seasonState)}.`);
    if (latest.temperatureAnomalyC != null) {
      evidence.push(`Karşılaştırma dönemine göre sıcaklık sapması ${latest.temperatureAnomalyC >= 0 ? '+' : ''}${latest.temperatureAnomalyC.toFixed(1)} °C.`);
    }
    if (latest.precipitationDeficitPct != null) {
      evidence.push(`Yağış açığı göstergesi %${Math.round(latest.precipitationDeficitPct)}.`);
    }
  }
  if (persistence.persistentDry) {
    evidence.push(`Kurak sapma son kayıtlarda kalıcı: ${consecutiveDrySnapshots || drySnapshots} tekrar.`);
  }
  if (persistence.persistentWarm) {
    evidence.push(`Sıcak sapma son kayıtlarda kalıcı: ${consecutiveWarmSnapshots || warmSnapshots} tekrar.`);
  }

  const trend = deriveTrend(history);
  const status: ClimateAnomalyMemory['status'] = latest
    ? history.length >= 3
      ? 'ready'
      : 'partial'
    : 'needs_data';

  return {
    version: '1.0',
    fieldId,
    status,
    latest,
    historyCount: history.length,
    history: history.slice(0, 12),
    persistence,
    trend,
    summary: latest
      ? `Bu sezonun son agroiklim karşılaştırması ${stateLabel(latest.seasonState)} görünüyor.${persistence.persistentDry ? ' Kurak sapma birden fazla kayıtta sürüyor.' : ''}${persistence.persistentWarm ? ' Sıcak sapma birden fazla kayıtta sürüyor.' : ''}`
      : 'Sezon anomalisi hafızası için karşılaştırılabilir agroiklim kaydı henüz yok.',
    evidence: evidence.slice(0, 6),
    guardrails: {
      oneSnapshotPerDay: true,
      worldClimIsContextNotMonthlyNormal: true,
      memoryDoesNotAlterShortTermRiskScore: true,
      noAnomalyWithoutBaselineEvidence: true,
    },
    generatedAt: new Date().toISOString(),
  };
}

export async function updateClimateAnomalyMemory(input: {
  fieldId: string;
  agroClimate?: AgroClimateBaselineEvidence | null;
  worldClim?: WorldClimReference | null;
}): Promise<ClimateAnomalyMemory> {
  const fieldId = String(input.fieldId ?? '').trim();
  const key = cacheKey(fieldId);

  const previous =
    (await readFieldMapLayerCache<ClimateAnomalyMemory>(
      fieldId,
      CACHE_NAMESPACE,
      key,
      CACHE_TTL_MS,
      { allowExpired: true },
    )) ?? null;

  const nextSnapshot = snapshotFromInputs(input.agroClimate, input.worldClim);
  let history = Array.isArray(previous?.history) ? [...previous.history] : [];

  if (nextSnapshot) {
    const sameDayIndex = history.findIndex((item) => item.dateKey === nextSnapshot.dateKey);
    if (sameDayIndex >= 0) history[sameDayIndex] = nextSnapshot;
    else history.unshift(nextSnapshot);
  }

  history = history
    .filter((item) => item && item.dateKey)
    .sort((a, b) => String(b.capturedAt).localeCompare(String(a.capturedAt)))
    .slice(0, MAX_HISTORY);

  const memory = buildMemory(fieldId, history);

  if (fieldId && (nextSnapshot || previous)) {
    await writeFieldMapLayerCache(
      fieldId,
      CACHE_NAMESPACE,
      key,
      memory,
      CACHE_TTL_MS,
    );
  }

  return memory;
}

export function compactClimateAnomalyMemory(
  value: ClimateAnomalyMemory | null | undefined,
) {
  if (!value) return null;
  return {
    version: value.version,
    status: value.status,
    latest: value.latest
      ? {
          dateKey: value.latest.dateKey,
          seasonState: value.latest.seasonState,
          temperatureAnomalyC: value.latest.temperatureAnomalyC,
          precipitationDeficitPct: value.latest.precipitationDeficitPct,
          waterBalanceAnomalyMm: value.latest.waterBalanceAnomalyMm,
          soilMoisture7To28Percentile: value.latest.soilMoisture7To28Percentile,
        }
      : null,
    historyCount: value.historyCount,
    persistence: value.persistence,
    trend: value.trend,
    summary: value.summary,
    evidence: value.evidence.slice(0, 4),
    guardrails: value.guardrails,
    generatedAt: value.generatedAt,
  };
}
