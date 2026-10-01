import { supabase } from '../../../supabaseClient';
import type {
  RegionalPestDiseaseContext,
  RegionalPestDiseaseSignal,
  RegionalPressureLevel,
} from '../types/regionalPestDisease';

type AggregateRow = {
  threat_key?: unknown;
  common_name?: unknown;
  scientific_name?: unknown;
  threat_type?: unknown;
  observation_count?: unknown;
  verified_count?: unknown;
  trusted_count?: unknown;
  source_count?: unknown;
  nearest_distance_km?: unknown;
  newest_observed_on?: unknown;
  source_labels?: unknown;
};

function text(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function daysOld(value: string | null, now: Date) {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  if (!Number.isFinite(date.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86400000));
}

function pressureLevel(score: number): RegionalPressureLevel {
  if (score >= 72) return 'high';
  if (score >= 52) return 'elevated';
  if (score >= 30) return 'watch';
  return 'none';
}

function sourceLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(text).filter(Boolean))].slice(0, 5);
}

function buildSignal(row: AggregateRow, now: Date): RegionalPestDiseaseSignal | null {
  const threatKey = text(row.threat_key);
  if (!threatKey) return null;

  const observationCount = Math.max(0, Math.round(finite(row.observation_count) ?? 0));
  const verifiedCount = Math.max(0, Math.round(finite(row.verified_count) ?? 0));
  const trustedCount = Math.max(0, Math.round(finite(row.trusted_count) ?? 0));
  const sourceCount = Math.max(0, Math.round(finite(row.source_count) ?? 0));
  const nearestDistanceKm = finite(row.nearest_distance_km);
  const newestObservedOn = text(row.newest_observed_on) || null;
  const ageDays = daysOld(newestObservedOn, now);

  let score = Math.min(38, observationCount * 11);
  score += Math.min(16, verifiedCount * 6 + trustedCount * 3);
  if (sourceCount >= 2) score += 10;
  if (sourceCount >= 3) score += 4;

  if (nearestDistanceKm !== null) {
    if (nearestDistanceKm <= 10) score += 18;
    else if (nearestDistanceKm <= 25) score += 12;
    else if (nearestDistanceKm <= 50) score += 7;
    else score += 3;
  }

  if (ageDays !== null) {
    if (ageDays <= 3) score += 16;
    else if (ageDays <= 7) score += 11;
    else if (ageDays <= 14) score += 6;
    else score += 2;
  }

  score = Math.round(clamp(score, 0, 100));
  const level = pressureLevel(score);
  const labels = sourceLabels(row.source_labels);
  const distanceText = nearestDistanceKm === null
    ? null
    : `En yakın doğrulanmış bölgesel kayıt yaklaşık ${nearestDistanceKm.toFixed(nearestDistanceKm < 10 ? 1 : 0)} km.`;
  const dateText = newestObservedOn
    ? `En yeni bölgesel kayıt ${newestObservedOn}.`
    : null;

  return {
    threatKey,
    commonName: text(row.common_name) || null,
    scientificName: text(row.scientific_name) || null,
    threatType: ['disease', 'pest'].includes(text(row.threat_type))
      ? text(row.threat_type) as 'disease' | 'pest'
      : 'unknown',
    observationCount,
    verifiedCount,
    trustedCount,
    sourceCount,
    nearestDistanceKm,
    newestObservedOn,
    pressureScore: score,
    level,
    sourceLabels: labels,
    evidence: [
      observationCount > 0 ? `${observationCount} bölgesel kayıt aynı tehdit altında toplandı.` : null,
      verifiedCount > 0 ? `${verifiedCount} kayıt doğrulanmış kaynak statüsünde.` : null,
      sourceCount > 1 ? `${sourceCount} bağımsız kaynak aynı bölgesel sinyali destekliyor.` : null,
      distanceText,
      dateText,
      'Bölgesel gözlem tarlada hastalık/zararlı varlığını kanıtlamaz.',
    ].filter((value): value is string => Boolean(value)),
  };
}

function emptyContext(
  fieldId: string,
  status: RegionalPestDiseaseContext['status'],
  radiusKm: number,
  lookbackDays: number,
  missingInputs: string[],
): RegionalPestDiseaseContext {
  return {
    version: '17.0',
    fieldId,
    status,
    radiusKm,
    lookbackDays,
    topSignal: null,
    signals: [],
    diagnosisAuthority: false,
    chemicalPrescriptionAuthority: false,
    generatedAt: new Date().toISOString(),
    sourceModel: 'regional-observation-aggregate-v17',
    missingInputs,
    guardrails: {
      nearbyObservationIsNotFieldPresence: true,
      regionalPressureIsNotProbability: true,
      noChemicalPrescriptionFromRegionalSignal: true,
      rawObservationCoordinatesAreNotExposed: true,
    },
  };
}

export async function fetchRegionalPestDiseaseContext(
  fieldIdInput: string | number,
  options: { radiusKm?: number; lookbackDays?: number } = {},
): Promise<RegionalPestDiseaseContext> {
  const fieldId = text(fieldIdInput);
  const radiusKm = Math.round(clamp(Number(options.radiusKm ?? 75), 10, 150));
  const lookbackDays = Math.round(clamp(Number(options.lookbackDays ?? 21), 7, 45));

  if (!fieldId) {
    return emptyContext('', 'needs_data', radiusKm, lookbackDays, ['field_id']);
  }

  if (!supabase) {
    return emptyContext(fieldId, 'unavailable', radiusKm, lookbackDays, ['supabase']);
  }

  const { data, error } = await supabase.rpc('get_regional_pest_disease_radar', {
    p_field_id: fieldId,
    p_radius_km: radiusKm,
    p_days: lookbackDays,
  });

  if (error) {
    const message = String(error.message ?? '').toLowerCase();
    if (message.includes('get_regional_pest_disease_radar') || message.includes('function')) {
      return emptyContext(fieldId, 'unavailable', radiusKm, lookbackDays, ['regional_radar_rpc']);
    }
    throw error;
  }

  const now = new Date();
  const signals = (Array.isArray(data) ? data : [])
    .map((row) => buildSignal((row ?? {}) as AggregateRow, now))
    .filter((signal): signal is RegionalPestDiseaseSignal => Boolean(signal))
    .filter((signal) => signal.level !== 'none')
    .sort((a, b) => b.pressureScore - a.pressureScore || (a.nearestDistanceKm ?? 999) - (b.nearestDistanceKm ?? 999))
    .slice(0, 5);

  return {
    version: '17.0',
    fieldId,
    status: signals.length ? 'ready' : 'no_signal',
    radiusKm,
    lookbackDays,
    topSignal: signals[0] ?? null,
    signals,
    diagnosisAuthority: false,
    chemicalPrescriptionAuthority: false,
    generatedAt: now.toISOString(),
    sourceModel: 'regional-observation-aggregate-v17',
    missingInputs: [],
    guardrails: {
      nearbyObservationIsNotFieldPresence: true,
      regionalPressureIsNotProbability: true,
      noChemicalPrescriptionFromRegionalSignal: true,
      rawObservationCoordinatesAreNotExposed: true,
    },
  };
}

export function compactRegionalPestDiseaseContext(
  context: RegionalPestDiseaseContext | null | undefined,
) {
  if (!context) return null;
  return {
    version: context.version,
    status: context.status,
    radiusKm: context.radiusKm,
    lookbackDays: context.lookbackDays,
    topSignal: context.topSignal
      ? {
          threatKey: context.topSignal.threatKey,
          commonName: context.topSignal.commonName,
          scientificName: context.topSignal.scientificName,
          threatType: context.topSignal.threatType,
          observationCount: context.topSignal.observationCount,
          sourceCount: context.topSignal.sourceCount,
          nearestDistanceKm: context.topSignal.nearestDistanceKm,
          newestObservedOn: context.topSignal.newestObservedOn,
          pressureScore: context.topSignal.pressureScore,
          level: context.topSignal.level,
          evidence: context.topSignal.evidence,
        }
      : null,
    signals: context.signals.slice(0, 3).map((signal) => ({
      threatKey: signal.threatKey,
      commonName: signal.commonName,
      threatType: signal.threatType,
      observationCount: signal.observationCount,
      nearestDistanceKm: signal.nearestDistanceKm,
      pressureScore: signal.pressureScore,
      level: signal.level,
    })),
    diagnosisAuthority: false as const,
    chemicalPrescriptionAuthority: false as const,
    generatedAt: context.generatedAt,
    guardrails: context.guardrails,
  };
}
