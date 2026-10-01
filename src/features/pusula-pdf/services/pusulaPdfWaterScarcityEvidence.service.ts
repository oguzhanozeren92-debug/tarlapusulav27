import { supabase } from '../../../supabaseClient';
import { calculateIrrigationDecision } from '../../irrigation/services/irrigationDecision.service';
import { loadWaterScarcityPlanSnapshot } from '../../water-scarcity/services/waterScarcityPlan.service';

const NAMESPACE = 'pdf-layer-archive-v1';
const RETENTION_MS = 20 * 365 * 24 * 60 * 60 * 1000;

export async function mirrorLatestWaterScarcityEvidenceForPdf(fieldIdInput: string) {
  const fieldId = String(fieldIdInput ?? '').trim();
  if (!fieldId) return false;

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return false;

  let irrigationDecision = null;
  try {
    irrigationDecision = await calculateIrrigationDecision({ id: fieldId });
  } catch {
    irrigationDecision = null;
  }

  let snapshot;
  try {
    snapshot = await loadWaterScarcityPlanSnapshot({ fieldId, irrigationDecision });
  } catch {
    return false;
  }

  const now = new Date();
  const { error } = await supabase.from('field_map_layer_cache').upsert({
    user_id: userId,
    field_id: fieldId,
    namespace: NAMESPACE,
    cache_key: `${fieldId}:water-scarcity-plan`,
    payload: {
      layer: 'water-scarcity-plan',
      label: 'Su Kıtlığı Planı',
      sourceModel: 'water-scarcity-plan-engine-v23',
      productionAuthority: false,
      observedAt: snapshot.budget.profile?.verifiedAt ?? snapshot.generatedAt,
      metrics: {
        state: snapshot.state,
        confidence: snapshot.confidence,
        remainingWaterM3: snapshot.budget.remainingWaterM3,
        recordedUseM3: snapshot.budget.recordedUseM3,
        planningNetNeedM3: snapshot.irrigation.planningNetNeedM3,
        grossNeedM3: snapshot.irrigation.grossNeedM3,
        coverageRatio: snapshot.irrigation.physicalCoverageRatio,
        irrigationEfficiencyPct: snapshot.irrigation.irrigationEfficiencyPct,
        phenologySensitivity: snapshot.phenology.sensitivity,
        forecast5DayClimatePressureMm: snapshot.climate.forecast5DayClimatePressureMm,
        maxTemperatureC: snapshot.climate.maxTemperatureC,
      },
      details: {
        budget: snapshot.budget,
        irrigation: snapshot.irrigation,
        phenology: snapshot.phenology,
        climate: snapshot.climate,
        headline: snapshot.headline,
        summary: snapshot.summary,
        action: snapshot.action,
        evidence: snapshot.evidence,
        missing: snapshot.missing,
        guardrails: snapshot.guardrails,
      },
      archivedAt: now.toISOString(),
    },
    data_date: snapshot.generatedAt.slice(0, 10),
    source_key: 'water-scarcity-plan-engine-v23',
    saved_at: now.toISOString(),
    expires_at: new Date(now.getTime() + RETENTION_MS).toISOString(),
    updated_at: now.toISOString(),
  }, { onConflict: 'user_id,field_id,namespace,cache_key' });

  if (error) throw error;
  return true;
}
