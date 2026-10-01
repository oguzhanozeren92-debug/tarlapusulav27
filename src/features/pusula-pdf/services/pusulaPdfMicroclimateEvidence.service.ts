import { supabase } from '../../../supabaseClient';

const NAMESPACE = 'pdf-layer-archive-v1';
const RETENTION_MS = 20 * 365 * 24 * 60 * 60 * 1000;

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export async function mirrorLatestMicroclimateEvidenceForPdf(fieldIdInput: string) {
  const fieldId = String(fieldIdInput ?? '').trim();
  if (!fieldId) return false;

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return false;

  const { data: devices, error: deviceError } = await supabase
    .from('field_sensor_devices')
    .select('id,device_uid,name,protocol,expected_pressure_min_kpa,expected_pressure_max_kpa,expected_flow_min_l_min,expected_flow_max_l_min,last_seen_at')
    .eq('user_id', userId)
    .eq('field_id', fieldId)
    .eq('enabled', true);

  if (deviceError) {
    if (deviceError.code === '42P01') return false;
    throw deviceError;
  }
  if (!devices?.length) return false;

  const ids = devices.map((item: any) => String(item.id));
  const { data: observations, error: observationError } = await supabase
    .from('field_sensor_observations')
    .select('device_id,observed_at,air_temperature_c,relative_humidity_pct,soil_moisture_vwc,soil_temperature_c,rainfall_mm,leaf_wetness_pct,pressure_kpa,flow_l_min,battery_pct,rssi_dbm')
    .eq('user_id', userId)
    .eq('field_id', fieldId)
    .in('device_id', ids)
    .order('observed_at', { ascending: false })
    .limit(Math.min(200, ids.length * 20));

  if (observationError) throw observationError;
  if (!observations?.length) return false;

  const latest: any = observations[0];
  const device = devices.find((item: any) => String(item.id) === String(latest.device_id)) ?? devices[0];
  const now = new Date();
  const ageMinutes = Math.max(0, (now.getTime() - Date.parse(String(latest.observed_at))) / 60_000);
  const pressure = finite(latest.pressure_kpa);
  const flow = finite(latest.flow_l_min);
  const pressureMin = finite(device?.expected_pressure_min_kpa);
  const pressureMax = finite(device?.expected_pressure_max_kpa);
  const flowMin = finite(device?.expected_flow_min_l_min);
  const flowMax = finite(device?.expected_flow_max_l_min);
  const pressureAlert = pressure !== null && ((pressureMin !== null && pressure < pressureMin) || (pressureMax !== null && pressure > pressureMax));
  const flowAlert = flow !== null && ((flowMin !== null && flow < flowMin) || (flowMax !== null && flow > flowMax));

  const { error: cacheError } = await supabase.from('field_map_layer_cache').upsert({
    user_id: userId,
    field_id: fieldId,
    namespace: NAMESPACE,
    cache_key: `${fieldId}:microclimate-sensor`,
    payload: {
      layer: 'microclimate-sensor',
      label: 'Mikroiklim + Sensör',
      sourceModel: 'microclimate-sensor-v24',
      productionAuthority: false,
      observedAt: latest.observed_at,
      metrics: {
        deviceCount: devices.length,
        ageMinutes,
        airTemperatureC: finite(latest.air_temperature_c),
        relativeHumidityPct: finite(latest.relative_humidity_pct),
        soilMoistureVwc: finite(latest.soil_moisture_vwc),
        soilTemperatureC: finite(latest.soil_temperature_c),
        rainfallMm: finite(latest.rainfall_mm),
        leafWetnessPct: finite(latest.leaf_wetness_pct),
        pressureKpa: pressure,
        flowLMin: flow,
        pressureAlert,
        flowAlert,
      },
      details: {
        device: {
          uid: device?.device_uid ?? null,
          name: device?.name ?? null,
          protocol: device?.protocol ?? null,
        },
        expectedRanges: {
          pressureMinKpa: pressureMin,
          pressureMaxKpa: pressureMax,
          flowMinLMin: flowMin,
          flowMaxLMin: flowMax,
        },
        guardrails: [
          'Sensör ölçümü saha kanıtıdır; tek başına hastalık, don veya sulama arızası teşhisi değildir.',
          'Debi/basınç uyarısı yalnız cihaz için tanımlanan beklenen aralıkla karşılaştırılır.',
          'Toprak nemi sensör derinliği tanımlıysa mevcut sulama ölçüm omurgasına aynalanır.',
        ],
      },
      archivedAt: now.toISOString(),
    },
    data_date: String(latest.observed_at).slice(0, 10),
    source_key: 'microclimate-sensor-v24',
    saved_at: now.toISOString(),
    expires_at: new Date(now.getTime() + RETENTION_MS).toISOString(),
    updated_at: now.toISOString(),
  }, { onConflict: 'user_id,field_id,namespace,cache_key' });

  if (cacheError) throw cacheError;
  return true;
}
