import { supabase } from '../../../supabaseClient';
import { loadFrostPocketSnapshot } from '../../frost-pocket/services/frostPocket.service';
import { loadFieldWorkabilitySnapshot } from '../../field-workability/services/fieldWorkability.service';

const NAMESPACE = 'pdf-layer-archive-v1';
const RETENTION_MS = 20 * 365 * 24 * 60 * 60 * 1000;

export async function mirrorLatestFieldWorkabilityEvidenceForPdf(fieldIdInput: string) {
  const fieldId = String(fieldIdInput ?? '').trim();
  if (!fieldId) return false;

  let terrain = null;
  try {
    terrain = (await loadFrostPocketSnapshot(fieldId, null)).terrain;
  } catch {
    terrain = null;
  }

  let snapshot;
  try {
    snapshot = await loadFieldWorkabilitySnapshot(fieldId, { terrain });
  } catch {
    return false;
  }

  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user?.id;
  if (!userId) return false;

  const now = new Date();
  const { error } = await supabase
    .from('field_map_layer_cache')
    .upsert({
      user_id: userId,
      field_id: fieldId,
      namespace: NAMESPACE,
      cache_key: `${fieldId}:field-workability`,
      payload: {
        layer: 'field-workability',
        label: 'Bugün Tarlaya Girilir mi? / Sıkışma Ön Taraması',
        sourceModel: 'field-workability-engine-v21',
        productionAuthority: false,
        observedAt: snapshot.surfaceWater.observedAt?.slice(0, 10) ?? snapshot.generatedAt.slice(0, 10),
        metrics: {
          status: snapshot.status,
          confidence: snapshot.confidence,
          surfaceWaterSource: snapshot.surfaceWater.source,
          surfaceWaterVol: snapshot.surfaceWater.volumetricWaterContent,
          fieldCapacityVol: snapshot.surfaceWater.fieldCapacityVol,
          ratioToFieldCapacity: snapshot.surfaceWater.ratioToFieldCapacity,
          trafficabilityThresholdRatio: snapshot.surfaceWater.trafficabilityThresholdRatio,
          meanSlopeDeg: snapshot.terrain.meanSlopeDeg,
          maxSlopeDeg: snapshot.terrain.maxSlopeDeg,
          rainLast24hMm: snapshot.wetting.rainLast24hMm,
          rainLast48hMm: snapshot.wetting.rainLast48hMm,
          rainLast72hMm: snapshot.wetting.rainLast72hMm,
          forecastNext12hMm: snapshot.wetting.forecastNext12hMm,
        },
        details: {
          soil: snapshot.soil,
          wetting: snapshot.wetting,
          terrain: snapshot.terrain,
          headline: snapshot.headline,
          summary: snapshot.summary,
          evidence: snapshot.evidence,
          guardrails: snapshot.guardrails,
        },
        archivedAt: now.toISOString(),
      },
      data_date: snapshot.generatedAt.slice(0, 10),
      source_key: 'field-workability-engine-v21',
      saved_at: now.toISOString(),
      expires_at: new Date(now.getTime() + RETENTION_MS).toISOString(),
      updated_at: now.toISOString(),
    }, { onConflict: 'user_id,field_id,namespace,cache_key' });

  if (error) throw error;
  return true;
}
