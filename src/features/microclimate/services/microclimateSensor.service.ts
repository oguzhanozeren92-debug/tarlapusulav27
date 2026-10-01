import { supabase } from '../../../supabaseClient';
import { refreshModelReadinessBestEffort } from '../../../services/modelReadiness.service';
import { syncIrrigationEvidenceTasksBestEffort } from '../../tasks/services/fieldTasks.service';
import type {
  FieldSensorDevice,
  FieldSensorObservation,
  MicroclimateDeviceState,
  MicroclimateSensorSnapshot,
  SaveFieldSensorDeviceInput,
  SensorFreshness,
  SensorProtocol,
  SensorRangeAlert,
} from '../types/microclimateSensor';

const FRESH_MINUTES = 30;
const STALE_MINUTES = 360;

function text(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clampNumber(value: unknown, min: number, max: number) {
  const number = finite(value);
  if (number === null) return null;
  return Math.min(max, Math.max(min, number));
}

function mapDevice(row: any): FieldSensorDevice {
  return {
    id: String(row.id),
    fieldId: String(row.field_id),
    deviceUid: String(row.device_uid),
    name: String(row.name),
    protocol: String(row.protocol ?? 'mqtt') as SensorProtocol,
    mqttTopic: row.mqtt_topic == null ? null : String(row.mqtt_topic),
    enabled: row.enabled !== false,
    soilDepthFromCm: finite(row.soil_depth_from_cm),
    soilDepthToCm: finite(row.soil_depth_to_cm),
    expectedPressureMinKpa: finite(row.expected_pressure_min_kpa),
    expectedPressureMaxKpa: finite(row.expected_pressure_max_kpa),
    expectedFlowMinLMin: finite(row.expected_flow_min_l_min),
    expectedFlowMaxLMin: finite(row.expected_flow_max_l_min),
    lastSeenAt: row.last_seen_at == null ? null : String(row.last_seen_at),
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapObservation(row: any): FieldSensorObservation {
  return {
    id: String(row.id),
    fieldId: String(row.field_id),
    deviceId: String(row.device_id),
    observedAt: String(row.observed_at),
    airTemperatureC: finite(row.air_temperature_c),
    relativeHumidityPct: finite(row.relative_humidity_pct),
    soilMoistureVwc: finite(row.soil_moisture_vwc),
    soilTemperatureC: finite(row.soil_temperature_c),
    rainfallMm: finite(row.rainfall_mm),
    leafWetnessPct: finite(row.leaf_wetness_pct),
    pressureKpa: finite(row.pressure_kpa),
    flowLMin: finite(row.flow_l_min),
    batteryPct: finite(row.battery_pct),
    rssiDbm: finite(row.rssi_dbm),
    rawPayload: row.raw_payload && typeof row.raw_payload === 'object' ? row.raw_payload : {},
    createdAt: String(row.created_at),
  };
}

function ageMinutes(value: string | null, now = new Date()) {
  if (!value) return null;
  const at = Date.parse(value);
  if (!Number.isFinite(at)) return null;
  return Math.max(0, (now.getTime() - at) / 60_000);
}

function freshness(value: string | null, now = new Date()): SensorFreshness {
  const age = ageMinutes(value, now);
  if (age === null) return 'no_data';
  if (age <= FRESH_MINUTES) return 'fresh';
  if (age <= STALE_MINUTES) return 'stale';
  return 'offline';
}

function rangeAlert(
  device: FieldSensorDevice,
  latest: FieldSensorObservation | null,
): SensorRangeAlert[] {
  if (!latest) return [];
  const alerts: SensorRangeAlert[] = [];
  const push = (
    metric: 'pressure' | 'flow',
    value: number | null,
    min: number | null,
    max: number | null,
  ) => {
    if (value === null || (min === null && max === null)) return;
    if ((min !== null && value < min) || (max !== null && value > max)) {
      alerts.push({
        deviceId: device.id,
        deviceName: device.name,
        metric,
        value,
        min,
        max,
        observedAt: latest.observedAt,
      });
    }
  };
  push('pressure', latest.pressureKpa, device.expectedPressureMinKpa, device.expectedPressureMaxKpa);
  push('flow', latest.flowLMin, device.expectedFlowMinLMin, device.expectedFlowMaxLMin);
  return alerts;
}

function describeLatest(latest: FieldSensorObservation | null) {
  if (!latest) return [] as string[];
  const lines: string[] = [];
  if (latest.airTemperatureC !== null) lines.push(`Saha sıcaklığı ${latest.airTemperatureC.toFixed(1)} °C.`);
  if (latest.relativeHumidityPct !== null) lines.push(`Saha bağıl nemi %${latest.relativeHumidityPct.toFixed(0)}.`);
  if (latest.soilMoistureVwc !== null) lines.push(`Sensör toprak nemi ${(latest.soilMoistureVwc * 100).toFixed(1)}% VWC.`);
  if (latest.leafWetnessPct !== null) lines.push(`Yaprak ıslaklığı %${latest.leafWetnessPct.toFixed(0)}.`);
  if (latest.pressureKpa !== null) lines.push(`Hat basıncı ${latest.pressureKpa.toFixed(1)} kPa.`);
  if (latest.flowLMin !== null) lines.push(`Debi ${latest.flowLMin.toFixed(1)} L/dk.`);
  return lines;
}

export async function loadMicroclimateSensorSnapshot(
  fieldIdInput: string,
  now = new Date(),
): Promise<MicroclimateSensorSnapshot> {
  const fieldId = text(fieldIdInput);
  if (!fieldId) throw new Error('Mikroiklim sensörleri için tarla seçilemedi.');

  const generatedAt = now.toISOString();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) {
    return {
      fieldId, status: 'no_devices', confidence: 'low', generatedAt, deviceCount: 0,
      liveDeviceCount: 0, latestObservedAt: null, latest: null, devices: [], rangeAlerts: [],
      headline: 'Sensör bağlantısı yok',
      summary: 'Oturum olmadığı için tarla sensörleri okunamadı.', evidence: [],
      guardrails: ['Sensör yoksa Pusula uydu, hava, toprak ve saha kayıtlarıyla çalışmaya devam eder.'],
    };
  }

  const { data: deviceRows, error: deviceError } = await supabase
    .from('field_sensor_devices')
    .select('id,field_id,device_uid,name,protocol,mqtt_topic,enabled,soil_depth_from_cm,soil_depth_to_cm,expected_pressure_min_kpa,expected_pressure_max_kpa,expected_flow_min_l_min,expected_flow_max_l_min,last_seen_at,metadata,created_at,updated_at')
    .eq('user_id', auth.user.id)
    .eq('field_id', fieldId)
    .eq('enabled', true)
    .order('created_at', { ascending: true });

  if (deviceError) {
    if (deviceError.code === '42P01') {
      return {
        fieldId, status: 'no_devices', confidence: 'low', generatedAt, deviceCount: 0,
        liveDeviceCount: 0, latestObservedAt: null, latest: null, devices: [], rangeAlerts: [],
        headline: 'Sensör altyapısı henüz etkin değil',
        summary: 'Mikroiklim sensör tabloları Supabase projesine uygulanmadı.', evidence: [],
        guardrails: ['Sensör olmadan mevcut uydu/hava kararları kesilmez.'],
      };
    }
    throw deviceError;
  }

  const devices = (deviceRows ?? []).map(mapDevice);
  if (!devices.length) {
    return {
      fieldId, status: 'no_devices', confidence: 'low', generatedAt, deviceCount: 0,
      liveDeviceCount: 0, latestObservedAt: null, latest: null, devices: [], rangeAlerts: [],
      headline: 'Sensör bağlı değil',
      summary: 'Pusula sensör zorunlu tutmaz; uydu, hava ve saha kayıtlarıyla çalışmaya devam eder. Sensör bağlanırsa saha ölçümü karar güvenini artırır.',
      evidence: [],
      guardrails: [
        'Sensör verisi yardımcı saha kanıtıdır; tek ölçüm hastalık, don veya sulama arızası teşhisi değildir.',
        'Debi/basınç uyarısı yalnız cihaz için tanımlanan beklenen aralıkla karşılaştırılır.',
      ],
    };
  }

  const ids = devices.map((item) => item.id);
  const { data: observationRows, error: observationError } = await supabase
    .from('field_sensor_observations')
    .select('id,field_id,device_id,observed_at,air_temperature_c,relative_humidity_pct,soil_moisture_vwc,soil_temperature_c,rainfall_mm,leaf_wetness_pct,pressure_kpa,flow_l_min,battery_pct,rssi_dbm,raw_payload,created_at')
    .eq('user_id', auth.user.id)
    .eq('field_id', fieldId)
    .in('device_id', ids)
    .order('observed_at', { ascending: false })
    .limit(Math.min(500, Math.max(100, ids.length * 30)));

  if (observationError) throw observationError;

  const observations = (observationRows ?? []).map(mapObservation);
  const latestByDevice = new Map<string, FieldSensorObservation>();
  for (const observation of observations) {
    if (!latestByDevice.has(observation.deviceId)) latestByDevice.set(observation.deviceId, observation);
  }

  const deviceStates: MicroclimateDeviceState[] = devices.map((device) => {
    const latest = latestByDevice.get(device.id) ?? null;
    const seenAt = latest?.observedAt ?? device.lastSeenAt;
    return {
      device,
      latest,
      freshness: freshness(seenAt, now),
      ageMinutes: ageMinutes(seenAt, now),
      rangeAlerts: rangeAlert(device, latest),
    };
  });

  const latest = observations[0] ?? null;
  const rangeAlerts = deviceStates.flatMap((item) => item.rangeAlerts);
  const liveDeviceCount = deviceStates.filter((item) => item.freshness === 'fresh').length;
  const staleDeviceCount = deviceStates.filter((item) => item.freshness === 'stale').length;
  const batteryAttention = deviceStates.some((item) => item.latest?.batteryPct != null && item.latest.batteryPct <= 15);
  const status = rangeAlerts.length || batteryAttention
    ? 'attention'
    : liveDeviceCount > 0
      ? 'live'
      : staleDeviceCount > 0
        ? 'stale'
        : 'waiting';
  const confidence = liveDeviceCount >= 2 ? 'strong' : liveDeviceCount === 1 ? 'medium' : 'low';

  const headline = status === 'attention'
    ? 'Canlı sensör verisinde kontrol gerektiren sinyal var'
    : status === 'live'
      ? 'Mikroiklim sensörleri canlı'
      : status === 'stale'
        ? 'Sensör verisi güncelliğini kaybediyor'
        : 'Sensör kaydı bekleniyor';
  const summary = rangeAlerts.length
    ? `${rangeAlerts.length} debi/basınç ölçümü cihaz için tanımlanan beklenen aralığın dışında. Bu tek başına arıza teşhisi değildir; saha hattını kontrol et.`
    : status === 'live'
      ? `${liveDeviceCount}/${devices.length} sensör son ${FRESH_MINUTES} dakika içinde veri gönderdi. Gerçek saha ölçümleri Pusula'nın hava ve sulama bağlamına ekleniyor.`
      : status === 'stale'
        ? 'Son sensör verisi 30 dakikadan eski. Pusula bu ölçümü canlı karar yerine geçmiş saha kanıtı olarak değerlendirir.'
        : 'Cihaz tanımlı ancak henüz telemetri alınmadı.';

  return {
    fieldId,
    status,
    confidence,
    generatedAt,
    deviceCount: devices.length,
    liveDeviceCount,
    latestObservedAt: latest?.observedAt ?? null,
    latest,
    devices: deviceStates,
    rangeAlerts,
    headline,
    summary,
    evidence: [
      ...describeLatest(latest),
      ...rangeAlerts.slice(0, 3).map((item) => `${item.deviceName}: ${item.metric === 'pressure' ? 'basınç' : 'debi'} ${item.value.toFixed(1)}; beklenen aralık ${item.min ?? '—'}–${item.max ?? '—'}.`),
    ],
    guardrails: [
      'Saha sensörü, uydu/hava verisinin yerine geçmez; aynı karar bağlamında bağımsız ölçüm kanıtı olarak kullanılır.',
      'Debi veya basıncın beklenen aralık dışına çıkması boru, pompa veya damlatıcı arızasını tek başına doğrulamaz.',
      'Sensör yoksa TarlaPusula mevcut veri kaynaklarıyla çalışmaya devam eder; özellik sensör zorunluluğu oluşturmaz.',
      'Toprak nemi telemetrisi, sensör derinliği tanımlıysa mevcut field_water_measurements omurgasına en fazla 10 dakikada bir aynalanır.',
    ],
  };
}

export async function saveFieldSensorDevice(
  fieldIdInput: string,
  input: SaveFieldSensorDeviceInput,
): Promise<FieldSensorDevice> {
  const fieldId = text(fieldIdInput);
  const deviceUid = text(input.deviceUid);
  const name = text(input.name);
  const protocol = (input.protocol ?? 'mqtt') as SensorProtocol;
  if (!fieldId || !deviceUid || !name) throw new Error('Sensör için tarla, cihaz kimliği ve ad gerekli.');
  if (!['mqtt', 'http', 'manual'].includes(protocol)) throw new Error('Sensör protokolü mqtt, http veya manual olmalı.');

  const depthFrom = finite(input.soilDepthFromCm);
  const depthTo = finite(input.soilDepthToCm);
  if ((depthFrom !== null || depthTo !== null) && (depthFrom === null || depthTo === null || depthFrom < 0 || depthTo <= depthFrom || depthTo > 300)) {
    throw new Error('Toprak sensörü derinliği geçersiz.');
  }

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error('Sensör kaydetmek için oturum gerekli.');

  const mqttTopic = protocol === 'mqtt'
    ? text(input.mqttTopic) || `tarlapusula/${deviceUid}/telemetry`
    : null;

  const values = {
    user_id: auth.user.id,
    field_id: fieldId,
    device_uid: deviceUid,
    name,
    protocol,
    mqtt_topic: mqttTopic,
    enabled: input.enabled !== false,
    soil_depth_from_cm: depthFrom,
    soil_depth_to_cm: depthTo,
    expected_pressure_min_kpa: finite(input.expectedPressureMinKpa),
    expected_pressure_max_kpa: finite(input.expectedPressureMaxKpa),
    expected_flow_min_l_min: finite(input.expectedFlowMinLMin),
    expected_flow_max_l_min: finite(input.expectedFlowMaxLMin),
    metadata: input.metadata ?? {},
    updated_at: new Date().toISOString(),
  };

  let request = input.id
    ? supabase.from('field_sensor_devices').update(values).eq('id', input.id).eq('user_id', auth.user.id)
    : supabase.from('field_sensor_devices').upsert(values, { onConflict: 'user_id,device_uid' });

  const { data, error } = await request
    .select('id,field_id,device_uid,name,protocol,mqtt_topic,enabled,soil_depth_from_cm,soil_depth_to_cm,expected_pressure_min_kpa,expected_pressure_max_kpa,expected_flow_min_l_min,expected_flow_max_l_min,last_seen_at,metadata,created_at,updated_at')
    .single();
  if (error) throw error;

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('tp:sensor-config-updated', { detail: { fieldId } }));
  }
  return mapDevice(data);
}

export async function recordSensorObservation(input: {
  fieldId: string;
  deviceId: string;
  observedAt?: string | null;
  airTemperatureC?: number | null;
  relativeHumidityPct?: number | null;
  soilMoistureVwc?: number | null;
  soilTemperatureC?: number | null;
  rainfallMm?: number | null;
  leafWetnessPct?: number | null;
  pressureKpa?: number | null;
  flowLMin?: number | null;
  batteryPct?: number | null;
  rssiDbm?: number | null;
  rawPayload?: Record<string, unknown>;
}) {
  const fieldId = text(input.fieldId);
  const deviceId = text(input.deviceId);
  if (!fieldId || !deviceId) throw new Error('Sensör gözlemi için tarla ve cihaz gerekli.');
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error('Sensör gözlemi kaydetmek için oturum gerekli.');

  const values = {
    user_id: auth.user.id,
    field_id: fieldId,
    device_id: deviceId,
    observed_at: input.observedAt && Number.isFinite(Date.parse(input.observedAt)) ? input.observedAt : new Date().toISOString(),
    air_temperature_c: finite(input.airTemperatureC),
    relative_humidity_pct: clampNumber(input.relativeHumidityPct, 0, 100),
    soil_moisture_vwc: finite(input.soilMoistureVwc),
    soil_temperature_c: finite(input.soilTemperatureC),
    rainfall_mm: finite(input.rainfallMm),
    leaf_wetness_pct: clampNumber(input.leafWetnessPct, 0, 100),
    pressure_kpa: finite(input.pressureKpa),
    flow_l_min: finite(input.flowLMin),
    battery_pct: clampNumber(input.batteryPct, 0, 100),
    rssi_dbm: finite(input.rssiDbm),
    raw_payload: input.rawPayload ?? {},
  };

  if (values.soil_moisture_vwc !== null && (values.soil_moisture_vwc <= 0 || values.soil_moisture_vwc >= 1)) {
    throw new Error('Toprak nemi VWC 0 ile 1 arasında olmalı.');
  }

  const { data, error } = await supabase
    .from('field_sensor_observations')
    .insert(values)
    .select('id,field_id,device_id,observed_at,air_temperature_c,relative_humidity_pct,soil_moisture_vwc,soil_temperature_c,rainfall_mm,leaf_wetness_pct,pressure_kpa,flow_l_min,battery_pct,rssi_dbm,raw_payload,created_at')
    .single();
  if (error) throw error;

  refreshModelReadinessBestEffort(fieldId, 'pyfao56');
  refreshModelReadinessBestEffort(fieldId, 'aquacrop');
  syncIrrigationEvidenceTasksBestEffort(fieldId);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('tp:sensor-observation', { detail: { fieldId, deviceId } }));
    window.dispatchEvent(new CustomEvent('tp:field-context-updated', {
      detail: { fieldId, changedFields: ['sensor', 'soil_water', 'microclimate', 'irrigation_decision'], source: 'microclimate-sensor-v24' },
    }));
  }

  return mapObservation(data);
}
