import { supabase } from '../../../supabaseClient';
import { getFieldTasks } from '../../tasks/services/fieldTasks.service';
import { buildTaskMapSnapshot } from '../../task-map/services/taskMap.service';

const NAMESPACE = 'pdf-layer-archive-v1';
const RETENTION_MS = 20 * 365 * 24 * 60 * 60 * 1000;

export async function mirrorLatestTaskMapEvidenceForPdf(fieldIdInput: string) {
  const fieldId = String(fieldIdInput ?? '').trim();
  if (!fieldId) return false;

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return false;

  const tasks = await getFieldTasks(fieldId);
  const snapshot = buildTaskMapSnapshot(fieldId, tasks);
  const now = new Date();

  const { error } = await supabase.from('field_map_layer_cache').upsert({
    user_id: userId,
    field_id: fieldId,
    namespace: NAMESPACE,
    cache_key: `${fieldId}:task-map`,
    payload: {
      layer: 'task-map',
      label: 'Görev / Uygulama Haritası',
      sourceModel: 'task-map-engine-v25',
      productionAuthority: false,
      observedAt: now.toISOString(),
      metrics: {
        openTaskCount: snapshot.openTaskCount,
        spatialTaskCount: snapshot.spatialTaskCount,
        verifiedPrescriptionCount: snapshot.verifiedPrescriptionCount,
        blockedPrescriptionCount: snapshot.blockedPrescriptionCount,
      },
      details: {
        zones: snapshot.zones,
        guardrails: [
          'Görev bölgesi otomatik ilaç/gübre reçetesi değildir.',
          'Kaba yön hücresi makine yönlendirme geometrisi değildir.',
          'Sayısal doz yalnız doğrulanmış yerel reçete otoritesi varsa görünür.',
          'Uzaktan algılama tek başına kimyasal ürün seçimi veya doz üretmez.',
        ],
      },
      archivedAt: now.toISOString(),
    },
    data_date: now.toISOString().slice(0, 10),
    source_key: 'task-map-engine-v25',
    saved_at: now.toISOString(),
    expires_at: new Date(now.getTime() + RETENTION_MS).toISOString(),
    updated_at: now.toISOString(),
  }, { onConflict: 'user_id,field_id,namespace,cache_key' });

  if (error) throw error;
  return true;
}
