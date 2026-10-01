import { supabase } from '../../../supabaseClient';
import type { Field } from '../../../types';
import {
  listRecentFieldDataEvents,
  publishUserFieldDataEvent,
} from '../../data-backbone/services/fieldDataBackbone.service';
import type { FieldDataEvent } from '../../data-backbone/types/fieldDataBackbone';
import {
  canonicalCropRotationKey,
  findCropRotationProfile,
} from '../data/cropRotationProfiles';
import {
  normalizeCropRotationPreferences,
  optimizeCropRotation,
} from './cropRotationOptimization.service';
import type {
  CropRotationContext,
  CropRotationDiseasePressure,
  CropRotationEconomicsEvidence,
  CropRotationHistoryItem,
  CropRotationPlan,
  CropRotationPreferences,
} from '../types/cropRotation';

const PREF_EVENT_TYPE = 'crop_rotation_preferences_saved';
const PREF_SOURCE = 'crop-rotation/preferences-v1';

function text(value: unknown, max = 500) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function finite(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalize(value: unknown) {
  return text(value, 1800)
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isoDay(value: unknown) {
  const day = text(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function cropFamily(value: unknown) {
  return findCropRotationProfile(value)?.family ?? 'unknown';
}

function cropKeyForActivityDate(
  value: unknown,
  history: CropRotationHistoryItem[],
  fallbackCrop: string | null,
) {
  const day = isoDay(value);
  if (!day) return canonicalCropRotationKey(fallbackCrop);

  const direct = history.find((season) => {
    if (season.plantingDate && season.harvestDate) {
      return day >= season.plantingDate && day <= season.harvestDate;
    }
    return Number(day.slice(0, 4)) === season.year;
  });

  return direct?.cropKey ?? canonicalCropRotationKey(fallbackCrop);
}

function mapHistory(rows: any[]): CropRotationHistoryItem[] {
  return rows
    .map((row) => {
      const crop = text(row.crop, 120);
      const profile = findCropRotationProfile(crop);
      return {
        year: Number(row.year),
        crop,
        cropKey: profile?.key ?? null,
        family: profile?.family ?? 'unknown',
        plantingDate: isoDay(row.planting_date),
        harvestDate: isoDay(row.harvest_date),
      } satisfies CropRotationHistoryItem;
    })
    .filter((item) => Number.isInteger(item.year) && item.year >= 1900 && item.crop)
    .sort((a, b) => a.year - b.year)
    .slice(-8);
}

function nitrogenSignal(soilRow: any): CropRotationContext['labNitrogenSignal'] {
  if (!soilRow) return 'unknown';

  const ai = soilRow.ai_result && typeof soilRow.ai_result === 'object'
    ? soilRow.ai_result
    : {};

  const corpus = [
    soilRow.summary,
    ai.soilSummary,
    ai.cropInterpretation,
    ai?.values?.nitrogen,
    ...(Array.isArray(ai.attentionPoints) ? ai.attentionPoints : []),
    ...(Array.isArray(ai.recommendations) ? ai.recommendations : []),
  ]
    .map(normalize)
    .filter(Boolean)
    .join(' | ');

  if (!/(azot|nitrojen|nitrogen)/.test(corpus)) return 'unknown';

  const lowPattern = /(azot|nitrojen|nitrogen).{0,70}(dusuk|eksik|yetersiz|noksan|az|kritik)|(?:dusuk|eksik|yetersiz|noksan|az|kritik).{0,70}(azot|nitrojen|nitrogen)/;
  if (lowPattern.test(corpus)) return 'low';

  const normalPattern = /(azot|nitrojen|nitrogen).{0,70}(normal|yeterli|uygun|iyi)|(?:normal|yeterli|uygun|iyi).{0,70}(azot|nitrojen|nitrogen)/;
  return normalPattern.test(corpus) ? 'not_low' : 'unknown';
}

function eventCropKey(event: FieldDataEvent, fallbackCrop: string | null) {
  const payload = event.payload ?? {};
  return canonicalCropRotationKey(
    payload.crop ??
      payload.cropName ??
      payload.product ??
      payload.productName ??
      fallbackCrop,
  );
}

function eventIssue(event: FieldDataEvent) {
  const payload = event.payload ?? {};
  return text(
    payload.issue ??
      payload.issueType ??
      payload.disease ??
      payload.pest ??
      payload.possibleIssue ??
      payload.title ??
      event.eventType,
    180,
  );
}

function eventStrength(event: FieldDataEvent): CropRotationDiseasePressure['strength'] {
  const payload = event.payload ?? {};
  const normalized = normalize(payload.severity ?? payload.riskLevel ?? payload.level ?? '');
  const score = finite(payload.score ?? payload.riskScore ?? payload.confidence);
  if (/high|severe|urgent|yuksek|kritik/.test(normalized)) return 'high';
  if (score !== null && score >= 75) return 'high';
  return 'medium';
}

function buildDiseasePressure(
  activityRows: any[],
  events: FieldDataEvent[],
  history: CropRotationHistoryItem[],
  fallbackCrop: string | null,
): CropRotationDiseasePressure[] {
  const fromActivities = activityRows.flatMap((row) => {
    const analysis = row.ai_analysis && typeof row.ai_analysis === 'object' ? row.ai_analysis : null;
    if (!analysis) return [];
    const issueType = normalize(analysis.issueType);
    if (issueType !== 'disease' && issueType !== 'pest') return [];
    const confidence = finite(analysis.confidence) ?? 0;
    if (confidence < 60) return [];

    const cropKey = cropKeyForActivityDate(row.activity_date, history, fallbackCrop);
    return [{
      cropKey,
      family: cropFamily(cropKey),
      issue: text(analysis.possibleIssue ?? analysis.headline ?? issueType, 180) || issueType,
      observedAt: isoDay(row.activity_date),
      strength: confidence >= 80 || normalize(analysis.severity) === 'high' ? 'high' : 'medium',
      source: 'field-photo' as const,
    }];
  });

  const fromEvents = events
    .filter((event) => event.domain === 'plant_protection')
    .filter((event) => event.mutation !== 'deleted')
    .slice(0, 30)
    .map((event) => {
      const cropKey = eventCropKey(event, fallbackCrop);
      return {
        cropKey,
        family: cropFamily(cropKey),
        issue: eventIssue(event),
        observedAt: event.observedAt ?? event.occurredOn ?? event.createdAt,
        strength: eventStrength(event),
        source: 'field-data-event' as const,
      } satisfies CropRotationDiseasePressure;
    });

  const seen = new Set<string>();
  return [...fromActivities, ...fromEvents]
    .filter((item) => {
      const key = `${item.cropKey ?? 'unknown'}|${normalize(item.issue)}|${item.observedAt ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12);
}

function firstFinitePayload(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = finite(payload[key]);
    if (value !== null) return value;
  }
  return null;
}

function buildEconomics(
  events: FieldDataEvent[],
  fallbackCrop: string | null,
): CropRotationEconomicsEvidence[] {
  return events.flatMap((event) => {
    if (!['cost', 'yield', 'market', 'economy', 'model'].includes(String(event.domain))) return [];
    const payload = event.payload ?? {};
    const netMargin = firstFinitePayload(payload, [
      'netMargin',
      'net_margin',
      'grossMargin',
      'gross_margin',
      'profit',
      'netProfit',
      'net_profit',
    ]);
    if (netMargin === null) return [];
    const cropKey = eventCropKey(event, fallbackCrop);
    if (!cropKey) return [];
    return [{
      cropKey,
      observedNetMargin: netMargin,
      sourceLabel: text(payload.sourceLabel ?? payload.source ?? event.source, 160) || event.source,
    }];
  }).slice(0, 30);
}

function preferencesFromEvents(events: FieldDataEvent[]) {
  const event = events.find((item) => item.eventType === PREF_EVENT_TYPE && item.mutation !== 'deleted');
  const payload = event?.payload ?? {};
  return normalizeCropRotationPreferences({
    horizonYears: payload.horizonYears as CropRotationPreferences['horizonYears'],
    requiredCrops: Array.isArray(payload.requiredCrops) ? payload.requiredCrops.map(String) : [],
    excludedCrops: Array.isArray(payload.excludedCrops) ? payload.excludedCrops.map(String) : [],
    waterPolicy: payload.waterPolicy as CropRotationPreferences['waterPolicy'],
    maxHighWaterYears: payload.maxHighWaterYears === null || payload.maxHighWaterYears === undefined
      ? null
      : Number(payload.maxHighWaterYears),
  });
}

function irrigationStatus(value: unknown): CropRotationContext['irrigationStatus'] {
  const raw = text(value, 40);
  if (raw === 'irrigated' || raw === 'rainfed' || raw === 'partial') return raw;
  return 'unknown';
}

export async function buildCropRotationContext(
  fieldIdInput: string | number,
): Promise<CropRotationContext> {
  const fieldId = text(fieldIdInput, 100);
  if (!fieldId) throw new Error('Münavebe planı için tarla seçilemedi.');

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error('Münavebe verilerini okumak için oturum gerekli.');
  const userId = authData.user.id;

  const [fieldResult, seasonResult, activityResult, soilResult, eventResult] = await Promise.allSettled([
    supabase
      .from('fields')
      .select('id,name,crop,crop_cycle,irrigation_status,season')
      .eq('id', fieldId)
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('field_seasons')
      .select('id,year,crop,planting_date,harvest_date')
      .eq('field_id', fieldId)
      .eq('user_id', userId)
      .order('year', { ascending: true })
      .limit(12),
    supabase
      .from('activities')
      .select('id,activity_type,activity_date,ai_analysis,cost,notes')
      .eq('field_id', fieldId)
      .eq('user_id', userId)
      .order('activity_date', { ascending: false })
      .limit(220),
    supabase
      .from('soil_analyses')
      .select('id,summary,status,ai_result,created_at')
      .eq('field_id', fieldId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    listRecentFieldDataEvents(fieldId, { limit: 220 }),
  ]);

  if (fieldResult.status === 'rejected') throw fieldResult.reason;
  if (fieldResult.value.error) throw fieldResult.value.error;
  if (!fieldResult.value.data) throw new Error('Münavebe planı için tarla kaydı bulunamadı.');

  const warnings: string[] = [];
  const fieldRow = fieldResult.value.data as any;

  const seasonRows = seasonResult.status === 'fulfilled' && !seasonResult.value.error
    ? seasonResult.value.data ?? []
    : [];
  if (seasonResult.status === 'rejected' || seasonResult.value?.error) {
    warnings.push('Sezon geçmişi okunamadı; plan mevcut ürünle sınırlı bağlamda üretildi.');
  }

  const activityRows = activityResult.status === 'fulfilled' && !activityResult.value.error
    ? activityResult.value.data ?? []
    : [];
  if (activityResult.status === 'rejected' || activityResult.value?.error) {
    warnings.push('Saha işlem/fotoğraf kayıtları okunamadı; hastalık baskısı bağlamı eksik olabilir.');
  }

  const soilRow = soilResult.status === 'fulfilled' && !soilResult.value.error
    ? soilResult.value.data
    : null;
  if (soilResult.status === 'rejected' || soilResult.value?.error) {
    warnings.push('Son toprak raporu okunamadı; azot bağlamı rotasyon puanına katılmadı.');
  }

  const events = eventResult.status === 'fulfilled' ? eventResult.value : [];
  if (eventResult.status === 'rejected') {
    warnings.push('Ortak tarla veri omurgası okunamadı; kayıtlı rotasyon tercihleri ve ek kanıtlar kullanılamadı.');
  }

  const history = mapHistory(seasonRows as any[]);
  const currentCrop = text(fieldRow.crop, 120) || null;
  const currentCropKey = canonicalCropRotationKey(currentCrop);
  if (currentCrop && !currentCropKey) {
    warnings.push(`Mevcut ürün “${currentCrop}” standart rotasyon profilinde eşleşmedi; plan yalnız desteklenen adaylarla üretildi.`);
  }

  return {
    fieldId,
    fieldName: text(fieldRow.name, 160) || null,
    currentCrop,
    currentCropKey,
    cropCycle: text(fieldRow.crop_cycle, 40) === 'perennial' ? 'perennial' : 'annual',
    irrigationStatus: irrigationStatus(fieldRow.irrigation_status),
    history,
    diseasePressure: buildDiseasePressure(activityRows as any[], events, history, currentCrop),
    labNitrogenSignal: nitrogenSignal(soilRow),
    economics: buildEconomics(events, currentCrop),
    preferences: preferencesFromEvents(events),
    generatedAt: new Date().toISOString(),
    warnings,
  };
}

export async function loadCropRotationPlan(
  fieldId: string | number,
): Promise<CropRotationPlan> {
  const context = await buildCropRotationContext(fieldId);
  return optimizeCropRotation(context);
}

export async function saveCropRotationPreferences(
  field: Pick<Field, 'id'>,
  input: Partial<CropRotationPreferences>,
) {
  const preferences = normalizeCropRotationPreferences(input);

  await publishUserFieldDataEvent({
    fieldId: String(field.id),
    domain: 'season',
    eventType: PREF_EVENT_TYPE,
    source: PREF_SOURCE,
    changedFields: [
      'crop_rotation.horizon_years',
      'crop_rotation.required_crops',
      'crop_rotation.excluded_crops',
      'crop_rotation.water_policy',
      'crop_rotation.max_high_water_years',
    ],
    payload: {
      ...preferences,
      schemaVersion: 1,
    },
    observedAt: new Date().toISOString(),
  });

  return preferences;
}

export function compactCropRotationPlanForPusula(plan: CropRotationPlan | null) {
  if (!plan) return null;
  return {
    status: plan.status,
    generatedAt: plan.generatedAt,
    horizonYears: plan.horizonYears,
    startYear: plan.startYear,
    summary: plan.summary,
    actionContext: plan.actionContext,
    plan: plan.plan.map((item) => ({
      year: item.year,
      crop: item.cropLabel,
      family: item.family,
      waterDemand: item.waterDemand,
      reasons: item.reasons.slice(0, 2),
      cautions: item.cautions.slice(0, 2),
    })),
    evidence: plan.evidence.slice(0, 5),
    warnings: plan.warnings.slice(0, 4),
    solverContract: plan.solver.contract,
  };
}
