import { supabase } from '../../../supabaseClient';
import type { FieldYieldHarvestQualityLiveSnapshot } from '../types/fieldYieldHarvestQuality';
import type {
  YieldHarvestConsumerContext,
  YieldHarvestEvidenceConfidence,
  YieldHarvestEvidenceStatus,
  YieldHarvestScientificEvidence,
  YieldHarvestTodaySignal,
} from '../types/yieldHarvestEvidence';
import type { YieldHarvestQualitySnapshot } from '../types/yieldHarvestQuality';

function dateTimeFromDay(value: string | null | undefined) {
  const day = String(value ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day}T12:00:00.000Z` : null;
}

function evidenceStatus(snapshot: YieldHarvestQualitySnapshot): YieldHarvestEvidenceStatus {
  if (snapshot.dataQuality === 'insufficient' || snapshot.status === 'needs_data') return 'needs_data';
  if (snapshot.dataQuality === 'partial') return 'partial';
  return 'ready';
}

function evidenceConfidence(snapshot: YieldHarvestQualitySnapshot): YieldHarvestEvidenceConfidence {
  if (snapshot.dataQuality === 'good' && snapshot.observed.yieldKg !== null) return 'high';
  if (snapshot.dataQuality === 'good' || snapshot.dataQuality === 'partial') return 'medium';
  return 'low';
}

function stableQualityEntries(snapshot: YieldHarvestQualitySnapshot) {
  return Object.entries(snapshot.quality.measurements)
    .sort(([a], [b]) => a.localeCompare(b, 'tr'))
    .map(([key, value]) => [key, value]);
}

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function fingerprintOf(live: FieldYieldHarvestQualityLiveSnapshot) {
  const { snapshot, sources } = live;
  const payload = {
    fieldId: live.fieldId,
    engineVersion: snapshot.engineVersion,
    adapterVersion: sources.adapterVersion,
    crop: snapshot.crop,
    status: snapshot.status,
    observed: snapshot.observed,
    history: snapshot.history,
    harvest: snapshot.harvest,
    quality: {
      status: snapshot.quality.status,
      measurements: stableQualityEntries(snapshot),
    },
    dataQuality: snapshot.dataQuality,
    yieldSource: sources.yieldSource,
    harvestDateSource: sources.harvestDateSource,
    provenance: {
      yieldRecordId: sources.provenance.currentYieldRecordId,
      seasonRecordId: sources.provenance.currentSeasonRecordId,
      harvestQuantityOperationIds: [...sources.provenance.currentHarvestQuantityOperationIds].sort(),
      qualityMeasurementRecordId: sources.provenance.qualityMeasurementRecordId,
    },
    phenologyStage: sources.phenologyStage,
    ensemble: snapshot.ensemble ?? null,
  };
  return hashText(JSON.stringify(payload));
}

function todaySignal(snapshot: YieldHarvestQualitySnapshot): YieldHarvestTodaySignal {
  if (snapshot.status === 'harvested') {
    return {
      eligible: false,
      priority: 0,
      label: 'HASAT',
      title: 'Hasat Kaydı Tamam',
      detail: snapshot.harvest.actualDate ?? 'Hasat kaydı mevcut',
      tone: 'green',
      target: 'calendar',
    };
  }

  if (snapshot.status === 'harvest_window') {
    return {
      eligible: true,
      priority: 91,
      label: 'HASAT',
      title: 'Hasat Penceresini Kontrol Et',
      detail: snapshot.harvest.expectedDate
        ? `Beklenen tarih ${snapshot.harvest.expectedDate}`
        : 'Fenoloji hasat penceresine işaret ediyor',
      tone: 'amber',
      target: 'calendar',
    };
  }

  const days = snapshot.harvest.daysToExpectedHarvest;
  if (Number.isFinite(Number(days)) && Number(days) >= 0 && Number(days) <= 14) {
    return {
      eligible: true,
      priority: 80,
      label: 'HASAT',
      title: `Hasada Yaklaşık ${Math.round(Number(days))} Gün`,
      detail: snapshot.harvest.expectedDate ?? 'Hasat tarihi yaklaşıyor',
      tone: 'blue',
      target: 'calendar',
    };
  }

  return {
    eligible: false,
    priority: 0,
    label: 'HASAT',
    title: 'Hasat Takibi',
    detail: snapshot.dataQuality === 'insufficient'
      ? 'Hasat/verim için daha fazla saha verisi gerekli'
      : 'Hasat penceresi henüz yaklaşmadı',
    tone: 'neutral',
    target: 'ai',
  };
}

export function buildYieldHarvestConsumerContext(
  evidence: YieldHarvestScientificEvidence,
): YieldHarvestConsumerContext {
  const snapshot = evidence.snapshot;
  return {
    fieldId: evidence.fieldId,
    evidenceId: evidence.id,
    generatedAt: evidence.generatedAt,
    authority: {
      scope: 'yield.harvest_quality',
      engineKey: 'yield-harvest-engine',
      productionAuthority: true,
    },
    pusula: {
      crop: snapshot.crop,
      status: snapshot.status,
      observedYieldKg: snapshot.observed.yieldKg,
      observedYieldKgHa: snapshot.observed.yieldKgHa,
      averageYieldKg: snapshot.history.averageYieldKg,
      averageYieldKgHa: snapshot.history.averageYieldKgHa,
      trend: snapshot.history.trend,
      expectedHarvestDate: snapshot.harvest.expectedDate,
      actualHarvestDate: snapshot.harvest.actualDate,
      daysToExpectedHarvest: snapshot.harvest.daysToExpectedHarvest,
      qualityStatus: snapshot.quality.status,
      dataQuality: snapshot.dataQuality,
      notes: [...snapshot.notes],
      forecast: snapshot.ensemble?.forecast ?? null,
      harvestTiming: snapshot.ensemble?.harvestTiming ?? null,
    },
    today: todaySignal(snapshot),
    pdf: {
      sectionTitle: 'Verim & Hasat',
      dataQuality: snapshot.dataQuality,
      currentYieldKg: snapshot.observed.yieldKg,
      currentYieldKgHa: snapshot.observed.yieldKgHa,
      averageYieldKg: snapshot.history.averageYieldKg,
      trend: snapshot.history.trend,
      expectedHarvestDate: snapshot.harvest.expectedDate,
      actualHarvestDate: snapshot.harvest.actualDate,
      qualityStatus: snapshot.quality.status,
      qualityMeasurements: { ...snapshot.quality.measurements },
      ensembleForecast: snapshot.ensemble?.forecast ?? null,
      harvestTiming: snapshot.ensemble?.harvestTiming ?? null,
    },
  };
}

export async function persistFieldYieldHarvestEvidence(
  live: FieldYieldHarvestQualityLiveSnapshot,
): Promise<YieldHarvestScientificEvidence | null> {
  const fingerprint = fingerprintOf(live);
  const status = evidenceStatus(live.snapshot);
  const confidence = evidenceConfidence(live.snapshot);
  const observedAt = dateTimeFromDay(live.snapshot.harvest.actualDate)
    ?? dateTimeFromDay(live.snapshot.observed.harvestDate)
    ?? live.generatedAt;

  const inputSummary = {
    fingerprint,
    crop: live.snapshot.crop,
    cropCycle: live.sources.cropCycle,
    areaDecare: live.sources.areaDecare,
    yieldSource: live.sources.yieldSource,
    harvestDateSource: live.sources.harvestDateSource,
    recordCounts: {
      perennialYields: live.sources.perennialYieldRecords,
      seasons: live.sources.seasonRecords,
      harvestOperations: live.sources.harvestOperations,
      harvestOperationsWithUsableQuantity: live.sources.harvestOperationsWithUsableQuantity,
    },
    phenology: {
      loaded: live.sources.phenologyLoaded,
      stage: live.sources.phenologyStage,
    },
  };

  const evidence = {
    provenance: live.sources.provenance,
    warnings: live.sources.warnings,
    rules: {
      actualHarvestOverridesModel: true,
      noQualityScoreWithoutMeasurement: true,
      supportingModelsCannotOverrideObservedYield: true,
      modelRangeIsEvidenceEnvelopeNotConfidenceInterval: true,
      qualityRequiresMeasurement: true,
    },
  };

  const { data, error } = await supabase.rpc('upsert_yield_harvest_evidence', {
    p_field_id: live.fieldId,
    p_status: status,
    p_confidence: confidence,
    p_observed_at: observedAt,
    p_input_summary: inputSummary,
    p_evidence: evidence,
    p_output: live.snapshot,
    p_source_record_id: live.sources.provenance.currentYieldRecordId,
    p_source_event_ids: live.sources.provenance.currentHarvestQuantityOperationIds,
  });

  if (error) {
    console.warn('[YIELD-HARVEST] bilimsel kanıt yazılamadı:', error.message);
    return null;
  }

  const id = String(data ?? '').trim();
  if (!id) return null;

  const result: YieldHarvestScientificEvidence = {
    id,
    fieldId: live.fieldId,
    generatedAt: new Date().toISOString(),
    observedAt,
    status,
    confidence,
    snapshot: live.snapshot,
    sources: live.sources,
  };

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('tp:yield-harvest-evidence-updated', {
      detail: {
        fieldId: live.fieldId,
        evidenceId: id,
        status,
        confidence,
      },
    }));
  }

  return result;
}

export async function loadLatestFieldYieldHarvestEvidence(
  fieldIdInput: string | number | null | undefined,
): Promise<YieldHarvestScientificEvidence | null> {
  const fieldId = String(fieldIdInput ?? '').trim();
  if (!fieldId) return null;

  const { data, error } = await supabase
    .from('scientific_engine_evidence')
    .select('id,field_id,status,confidence,observed_at,generated_at,evidence,output')
    .eq('field_id', fieldId)
    .eq('engine_key', 'yield-harvest-engine')
    .eq('authority_scope', 'yield.harvest_quality')
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const output = data.output as unknown as YieldHarvestQualitySnapshot;
  const evidence = (data.evidence ?? {}) as Record<string, any>;
  const sources = {
    adapterVersion: '15.0',
    canonicalFieldLoaded: true,
    cropCycle: 'unknown',
    areaDecare: null,
    yieldSource: 'none',
    harvestDateSource: 'none',
    perennialYieldRecords: 0,
    seasonRecords: 0,
    harvestOperations: 0,
    harvestOperationsWithUsableQuantity: 0,
    qualityMeasurementLoaded: Boolean(evidence.provenance?.qualityMeasurementRecordId),
    phenologyLoaded: false,
    phenologyStage: null,
    ensembleSupportLoaded: Boolean(output?.ensemble),
    warnings: Array.isArray(evidence.warnings) ? evidence.warnings.map(String) : [],
    provenance: {
      currentYieldRecordId: evidence.provenance?.currentYieldRecordId
        ? String(evidence.provenance.currentYieldRecordId)
        : null,
      currentSeasonRecordId: evidence.provenance?.currentSeasonRecordId
        ? String(evidence.provenance.currentSeasonRecordId)
        : null,
      currentHarvestOperationIds: Array.isArray(evidence.provenance?.currentHarvestOperationIds)
        ? evidence.provenance.currentHarvestOperationIds.map(String)
        : [],
      currentHarvestQuantityOperationIds: Array.isArray(evidence.provenance?.currentHarvestQuantityOperationIds)
        ? evidence.provenance.currentHarvestQuantityOperationIds.map(String)
        : [],
      qualityMeasurementRecordId: evidence.provenance?.qualityMeasurementRecordId
        ? String(evidence.provenance.qualityMeasurementRecordId)
        : null,
    },
  } satisfies FieldYieldHarvestQualityLiveSnapshot['sources'];

  return {
    id: String(data.id),
    fieldId: String(data.field_id),
    generatedAt: String(data.generated_at),
    observedAt: data.observed_at ? String(data.observed_at) : null,
    status: data.status as YieldHarvestEvidenceStatus,
    confidence: data.confidence as YieldHarvestEvidenceConfidence,
    snapshot: output,
    sources,
  };
}
