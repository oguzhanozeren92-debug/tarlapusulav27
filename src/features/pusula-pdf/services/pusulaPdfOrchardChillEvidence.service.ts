import { supabase } from '../../../supabaseClient';
import type { OrchardChillSnapshot } from '../../orchard-chill/types/orchardChill';
import { loadOrchardChillSnapshot } from '../../orchard-chill/services/orchardChill.service';

const NAMESPACE = 'pdf-layer-archive-v1';
const RETENTION_MS = 20 * 365 * 24 * 60 * 60 * 1000;

export async function mirrorOrchardChillEvidenceForPdf(
  snapshot: OrchardChillSnapshot | null | undefined,
) {
  if (!snapshot?.fieldId || snapshot.status !== 'ready' || !snapshot.localMetrics) return false;

  const { data, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const userId = data.session?.user?.id;
  if (!userId) return false;

  const now = new Date();
  const legacyWindow = (snapshot as any).window as
    | { startDate?: unknown; endDate?: unknown }
    | undefined;
  const windowStart = String(
    snapshot.windowStart ?? legacyWindow?.startDate ?? '',
  ).slice(0, 10);
  const windowEnd = String(
    snapshot.windowEnd ?? legacyWindow?.endDate ?? snapshot.generatedAt ?? '',
  ).slice(0, 10);
  const observedAt = /^\d{4}-\d{2}-\d{2}$/.test(windowEnd)
    ? windowEnd
    : now.toISOString().slice(0, 10);
  const { error } = await supabase.from('field_map_layer_cache').upsert(
    {
      user_id: userId,
      field_id: snapshot.fieldId,
      namespace: NAMESPACE,
      cache_key: `${snapshot.fieldId}:orchard-chill-evidence`,
      payload: {
        layer: 'orchard-chill-evidence',
        label: 'Meyve Soğuklama Zekâsı',
        sourceModel: 'orchard-chill-engine-v11',
        productionAuthority: true,
        observedAt,
        metrics: {
          classicHours: snapshot.localMetrics.classicHours,
          utahUnits: snapshot.localMetrics.utahUnits,
          chillPortions: snapshot.localMetrics.chillPortions,
          hourlyCoveragePct: snapshot.coveragePct,
          officialObservedHours: snapshot.officialReference.officialObservedHours,
          officialRequirementHours: snapshot.officialReference.officialRequirementHours,
          officialRemainingHours: snapshot.officialReference.officialRemainingHours,
        },
        details: {
          crop: snapshot.crop,
          variety: snapshot.variety,
          status: snapshot.status,
          window: {
            startDate: /^\d{4}-\d{2}-\d{2}$/.test(windowStart) ? windowStart : null,
            endDate: /^\d{4}-\d{2}-\d{2}$/.test(windowEnd) ? windowEnd : null,
          },
          officialReference: snapshot.officialReference,
          evidence: snapshot.evidence,
          warnings: snapshot.warnings,
          methodNote:
            'MGM BİSİP resmî referanstır. TarlaPusula klasik/Utah/Dynamic değerleri tarla koordinatındaki saatlik sıcaklıktan hesaplar; bunlar MGM istasyon gözlemi değildir.',
        },
        archivedAt: now.toISOString(),
      },
      data_date: observedAt,
      source_key: 'orchard-chill-engine-v11',
      saved_at: now.toISOString(),
      expires_at: new Date(now.getTime() + RETENTION_MS).toISOString(),
      updated_at: now.toISOString(),
    },
    { onConflict: 'user_id,field_id,namespace,cache_key' },
  );

  if (error) throw error;
  return true;
}

export async function mirrorLatestOrchardChillEvidenceForPdf(fieldIdInput: string) {
  const fieldId = String(fieldIdInput ?? '').trim();
  if (!fieldId) return false;
  const snapshot = await loadOrchardChillSnapshot(fieldId);
  return mirrorOrchardChillEvidenceForPdf(snapshot);
}
