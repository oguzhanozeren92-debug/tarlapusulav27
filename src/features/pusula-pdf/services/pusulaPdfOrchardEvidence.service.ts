import { supabase } from '../../../supabaseClient';
import type { OrchardIntelligenceSnapshot } from '../../orchard/types/orchardTree';
import { loadOrchardIntelligenceSnapshot } from '../../orchard/services/orchardIntelligence.service';

const NAMESPACE = 'pdf-layer-archive-v1';
const RETENTION_MS = 20 * 365 * 24 * 60 * 60 * 1000;

export async function mirrorOrchardEvidenceForPdf(snapshot: OrchardIntelligenceSnapshot | null | undefined) {
  if (!snapshot?.pilotEnabled || !snapshot.fieldId || snapshot.treeCount === 0) return false;
  const { data, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const userId = data.session?.user?.id;
  if (!userId) return false;

  const now = new Date();
  const observedAt = (snapshot.latestObservationAt || snapshot.generatedAt).slice(0, 10);
  const { error } = await supabase.from('field_map_layer_cache').upsert({
    user_id: userId,
    field_id: snapshot.fieldId,
    namespace: NAMESPACE,
    cache_key: `${snapshot.fieldId}:orchard-tree-intelligence`,
    payload: {
      layer: 'orchard-tree-intelligence',
      label: 'Ağaç Bazlı Pusula',
      sourceModel: 'orchard-tree-engine-v16',
      productionAuthority: true,
      observedAt,
      metrics: {
        treeCount: snapshot.treeCount,
        geolocatedTreeCount: snapshot.geolocatedTreeCount,
        observedTreeCount: snapshot.observedTreeCount,
        stressedTreeCount: snapshot.stressedTreeCount,
        highStressTreeCount: snapshot.highStressTreeCount,
        waterStressTreeCount: snapshot.waterStressTreeCount,
        floweringTreeCount: snapshot.floweringTreeCount,
        fruitingTreeCount: snapshot.fruitingTreeCount,
        measuredYieldTreeCount: snapshot.measuredYieldTreeCount,
        measuredSensorTreeCount: snapshot.measuredSensorTreeCount,
        alternanceStatus: snapshot.alternance.status,
        alternanceTreeCount: snapshot.alternance.possibleTreeIds.length,
      },
      details: {
        crop: snapshot.crop,
        cropKey: snapshot.cropKey,
        status: snapshot.status,
        evidence: snapshot.evidence,
        warnings: snapshot.warnings,
        alternanceEvidence: snapshot.alternance.evidence,
        treeCodes: snapshot.trees.slice(0, 30).map((tree) => tree.treeCode),
        methodReferences: snapshot.methodReferences.map((item) => ({
          key: item.key,
          label: item.label,
          role: item.role,
          runtimeAvailable: item.runtimeAvailable,
        })),
      },
      archivedAt: now.toISOString(),
    },
    data_date: observedAt,
    source_key: 'orchard-tree-engine-v16',
    saved_at: now.toISOString(),
    expires_at: new Date(now.getTime() + RETENTION_MS).toISOString(),
    updated_at: now.toISOString(),
  }, { onConflict: 'user_id,field_id,namespace,cache_key' });

  if (error) throw error;
  return true;
}


export async function mirrorLatestOrchardEvidenceForPdf(fieldIdInput: string) {
  const fieldId = String(fieldIdInput ?? '').trim();
  if (!fieldId) return false;
  const { data: session, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const userId = session.session?.user?.id;
  if (!userId) return false;
  const { data: field, error } = await supabase
    .from('fields')
    .select('id,crop')
    .eq('id', fieldId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!field) return false;
  const snapshot = await loadOrchardIntelligenceSnapshot(fieldId, field.crop ?? '');
  return mirrorOrchardEvidenceForPdf(snapshot);
}
