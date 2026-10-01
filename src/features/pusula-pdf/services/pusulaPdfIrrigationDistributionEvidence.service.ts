import { supabase } from '../../../supabaseClient';

const NAMESPACE = 'pdf-layer-archive-v1';
const RETENTION_MS = 20 * 365 * 24 * 60 * 60 * 1000;

export async function mirrorLatestIrrigationDistributionEvidenceForPdf(fieldIdInput: string) {
  const fieldId = String(fieldIdInput ?? '').trim();
  if (!fieldId) return false;
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return false;
  const { data, error } = await supabase
    .from('field_irrigation_distribution_observations')
    .select('irrigation_operation_id,irrigation_date,satellite_date,area,assessment_status,anomaly_score,confidence,rain_between_mm,evidence,spatial_signature,created_at')
    .eq('user_id', userId)
    .eq('field_id', fieldId)
    .order('satellite_date', { ascending: false })
    .limit(8);
  if (error || !data?.length) return false;

  const latest: any = data[0];
  const sameAreaRepeat = latest.area
    ? new Set(data.filter((row: any) => row.area === latest.area && ['suspect', 'recurrent'].includes(String(row.assessment_status))).map((row: any) => row.irrigation_operation_id)).size
    : 0;
  const now = new Date();
  const { error: cacheError } = await supabase.from('field_map_layer_cache').upsert({
    user_id: userId,
    field_id: fieldId,
    namespace: NAMESPACE,
    cache_key: `${fieldId}:irrigation-distribution`,
    payload: {
      layer: 'irrigation-distribution',
      label: 'Sulama Dağılım Zekâsı',
      sourceModel: 'irrigation-distribution-engine-v22',
      productionAuthority: true,
      observedAt: latest.satellite_date,
      metrics: {
        status: latest.assessment_status,
        anomalyScore: latest.anomaly_score,
        confidence: latest.confidence,
        rainBetweenMm: latest.rain_between_mm,
        repeatCount: sameAreaRepeat,
        assessedIrrigationCount: data.length,
      },
      details: {
        area: latest.area,
        irrigationDate: latest.irrigation_date,
        satelliteDate: latest.satellite_date,
        evidence: latest.evidence,
        history: data,
        guardrails: [
          'Uzaktan sulama dağılım anomalisi ön taramasıdır; damlatıcı/boru/pompa arızasını doğrulamaz.',
          'Tek görüntü arıza teşhisi değildir; tekrarlayan durum farklı sulama olaylarında aynı bölgeyle doğrulanır.',
          'Yağış, drenaj, toprak ve diğer stresler karıştırıcı olabilir.',
        ],
      },
      archivedAt: now.toISOString(),
    },
    data_date: String(latest.satellite_date),
    source_key: 'irrigation-distribution-engine-v22',
    saved_at: now.toISOString(),
    expires_at: new Date(now.getTime() + RETENTION_MS).toISOString(),
    updated_at: now.toISOString(),
  }, { onConflict: 'user_id,field_id,namespace,cache_key' });
  if (cacheError) throw cacheError;
  return true;
}
