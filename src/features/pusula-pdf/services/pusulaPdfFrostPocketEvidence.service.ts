import { supabase } from '../../../supabaseClient';
import { loadFrostPocketSnapshot } from '../../frost-pocket/services/frostPocket.service';

const NAMESPACE = 'pdf-layer-archive-v1';
const RETENTION_MS = 20 * 365 * 24 * 60 * 60 * 1000;

export async function mirrorLatestFrostPocketEvidenceForPdf(fieldIdInput: string) {
  const fieldId = String(fieldIdInput ?? '').trim();
  if (!fieldId) return false;

  let snapshot;
  try {
    snapshot = await loadFrostPocketSnapshot(fieldId, null);
  } catch {
    return false;
  }

  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user?.id;
  if (!userId) return false;

  const now = new Date();
  const { error } = await supabase.from('field_map_layer_cache').upsert({
    user_id: userId,
    field_id: fieldId,
    namespace: NAMESPACE,
    cache_key: `${fieldId}:frost-pocket`,
    payload: {
      layer: 'frost-pocket',
      label: 'Tarla İçi Don Cepleri + Don Sonrası Kontrol',
      sourceModel: 'frost-pocket-engine-v20',
      productionAuthority: true,
      observedAt: snapshot.generatedAt.slice(0, 10),
      metrics: {
        reliefM: snapshot.terrain.reliefM,
        highPocketCount: snapshot.terrain.highPocketCount,
        mediumPocketCount: snapshot.terrain.mediumPocketCount,
        forecastFrostSignal: snapshot.forecast.frostSignal,
        forecastMinTemperatureC: snapshot.forecast.minTemperatureC,
        postEventSatelliteStatus: snapshot.postEventSatellite.status,
      },
      details: {
        latestEvent: snapshot.latestEvent,
        forecast: snapshot.forecast,
        postEventSatellite: snapshot.postEventSatellite,
        evidence: snapshot.evidence,
        guardrails: snapshot.guardrails,
        resolutionMeters: snapshot.terrain.resolutionMeters,
        highPocketCells: snapshot.terrain.cells
          .filter((cell) => cell.susceptibility === 'high')
          .slice(0, 20)
          .map((cell) => ({
            id: cell.id,
            latitude: cell.latitude,
            longitude: cell.longitude,
            elevationM: cell.elevationM,
            relativeElevationM: cell.relativeElevationM,
            slopeDeg: cell.slopeDeg,
          })),
      },
      archivedAt: now.toISOString(),
    },
    data_date: snapshot.generatedAt.slice(0, 10),
    source_key: 'frost-pocket-engine-v20',
    saved_at: now.toISOString(),
    expires_at: new Date(now.getTime() + RETENTION_MS).toISOString(),
    updated_at: now.toISOString(),
  }, { onConflict: 'user_id,field_id,namespace,cache_key' });

  if (error) throw error;
  return true;
}
