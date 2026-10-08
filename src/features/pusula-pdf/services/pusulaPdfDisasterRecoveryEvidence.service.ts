import { supabase } from '../../../supabaseClient';
import { fetchDisasterRecovery } from '../../disaster-recovery/services/disasterRecovery.service';

const NAMESPACE = 'pdf-layer-archive-v1';
const RETENTION_MS = 20 * 365 * 24 * 60 * 60 * 1000;

export async function mirrorLatestDisasterRecoveryEvidenceForPdf(fieldIdInput: string) {
  const fieldId = String(fieldIdInput ?? '').trim();
  if (!fieldId) return false;

  const result = await fetchDisasterRecovery(fieldId, false).catch(() => null);
  if (!result) return false;

  // PDF'ye yalnız gerçek olay adayı/olay sonrası iz taşıyan durumları aynala.
  // "Yeterli kanıt yok" gibi boş sonuçlar raporu gereksiz kalabalıklaştırmaz.
  if (
    !result.event &&
    !['damage_signal_supported', 'recovering', 'recovered', 'event_detected_waiting_satellite'].includes(result.status)
  ) {
    return false;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return false;

  const now = new Date();
  const observedAt = result.event?.date
    ? `${result.event.date}T12:00:00.000Z`
    : result.generatedAt;

  const { error } = await supabase.from('field_map_layer_cache').upsert({
    user_id: userId,
    field_id: fieldId,
    namespace: NAMESPACE,
    cache_key: `${fieldId}:disaster-recovery`,
    payload: {
      layer: 'disaster-recovery',
      label: 'Bu Tarlaya Ne Oldu? · Afet Sonrası Toparlanma',
      sourceModel: 'disaster-recovery-v27',
      productionAuthority: false,
      observedAt,
      metrics: {
        status: result.status,
        confidence: result.confidence,
        eventType: result.event?.type ?? null,
        eventDate: result.event?.date ?? null,
        ndviDrop: result.damage.ndviDrop,
        ndviDropPercent: result.damage.ndviDropPercent,
        radarSupport: result.damage.radarSupport,
        radarVhDropDb: result.damage.radarVhDropDb,
        recoveryStatus: result.recovery.status,
        latestNdvi: result.recovery.latestNdvi,
        percentOfPreEvent: result.recovery.percentOfPreEvent,
      },
      details: {
        headline: result.headline,
        summary: result.summary,
        action: result.action,
        event: result.event,
        damage: result.damage,
        recovery: result.recovery,
        evidence: result.evidence,
        missingInputs: result.missingInputs,
        weatherProvider: result.weatherProvider,
        caution: result.caution,
      },
      archivedAt: now.toISOString(),
    },
    data_date: String(observedAt).slice(0, 10),
    source_key: 'disaster-recovery-v27',
    saved_at: now.toISOString(),
    expires_at: new Date(now.getTime() + RETENTION_MS).toISOString(),
    updated_at: now.toISOString(),
  }, { onConflict: 'user_id,field_id,namespace,cache_key' });

  if (error) throw error;
  return true;
}
