import { supabase } from '../../../supabaseClient';
import type { YieldHarvestScientificEvidence } from '../../yield-quality/types/yieldHarvestEvidence';

const NAMESPACE = 'pdf-layer-archive-v1';
const RETENTION_MS = 20 * 365 * 24 * 60 * 60 * 1000;

function dateOnly(value: unknown) {
  const match = String(value ?? '').match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

export async function mirrorYieldHarvestEvidenceForPdf(
  evidence: YieldHarvestScientificEvidence | null | undefined,
) {
  if (!evidence || evidence.status === 'needs_data') return false;

  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user?.id;
  if (!userId) return false;

  const observedAt = dateOnly(evidence.observedAt ?? evidence.generatedAt);
  if (!observedAt) return false;

  const snapshot = evidence.snapshot;
  const now = new Date();
  const layer = 'yield-harvest-quality';
  const sourceKey = [
    layer,
    observedAt,
    snapshot.engineVersion,
    evidence.id,
  ].join(':');

  const payload = {
    schemaVersion: 2,
    fieldId: evidence.fieldId,
    layer,
    source: 'TarlaPusula Verim & Hasat Motoru',
    observedAt,
    processingVersion: `yield-harvest-${snapshot.engineVersion}-adapter-15.0`,
    metrics: {
      currentYieldKg: snapshot.observed.yieldKg,
      currentYieldKgHa: snapshot.observed.yieldKgHa,
      averageYieldKg: snapshot.history.averageYieldKg,
      averageYieldKgHa: snapshot.history.averageYieldKgHa,
      historicalSampleCount: snapshot.history.sampleCount,
      trend: snapshot.history.trend,
      daysToExpectedHarvest: snapshot.harvest.daysToExpectedHarvest,
      forecastLowerKgHa: snapshot.ensemble?.forecast.lowerKgHa ?? null,
      forecastCentralKgHa: snapshot.ensemble?.forecast.centralKgHa ?? null,
      forecastUpperKgHa: snapshot.ensemble?.forecast.upperKgHa ?? null,
      forecastModelMemberCount: snapshot.ensemble?.forecast.modelMemberCount ?? 0,
    },
    details: {
      status: snapshot.status,
      dataQuality: snapshot.dataQuality,
      crop: snapshot.crop,
      expectedHarvestDate: snapshot.harvest.expectedDate,
      actualHarvestDate: snapshot.harvest.actualDate,
      stage: snapshot.harvest.stage,
      qualityStatus: snapshot.quality.status,
      qualityMeasurements: snapshot.quality.measurements,
      notes: snapshot.notes,
      confidence: evidence.confidence,
      productionAuthority: true,
      authorityScope: 'yield.harvest_quality',
      evidenceId: evidence.id,
      provenance: evidence.sources.provenance,
      sourceWarnings: evidence.sources.warnings,
      supportingModels: snapshot.authority.supportingModels,
      ensembleForecast: snapshot.ensemble?.forecast ?? null,
      harvestTiming: snapshot.ensemble?.harvestTiming ?? null,
      ensembleMembers: snapshot.ensemble?.members ?? [],
      ensembleSupportingEvidence: snapshot.ensemble?.supportingEvidence ?? [],
      methodReferences: snapshot.ensemble?.methodReferences ?? [],
      qualityMeasurementRecordId: evidence.sources.provenance.qualityMeasurementRecordId,
      rules: {
        actualHarvestOverridesModel: true,
        modelRangeIsEvidenceEnvelopeNotConfidenceInterval: true,
        qualityRequiresMeasurement: true,
        methodReferenceIsNotRuntime: true,
      },
    },
    archivedAt: now.toISOString(),
    immutableEvidence: true,
  };

  const { error } = await supabase.from('field_map_layer_cache').upsert({
    user_id: userId,
    field_id: evidence.fieldId,
    namespace: NAMESPACE,
    cache_key: `${evidence.fieldId}:${sourceKey}`,
    payload,
    data_date: observedAt,
    source_key: sourceKey,
    saved_at: now.toISOString(),
    expires_at: new Date(now.getTime() + RETENTION_MS).toISOString(),
    updated_at: now.toISOString(),
  }, { onConflict: 'user_id,field_id,namespace,cache_key' });

  if (error) {
    console.warn('[PUSULAPDF] Verim/hasat kanıtı arşive yazılamadı:', error.message);
    return false;
  }

  return true;
}
