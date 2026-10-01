import mqtt from 'mqtt';
import { createClient } from '@supabase/supabase-js';

const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || '';
const MQTT_USERNAME = process.env.MQTT_USERNAME || '';
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || '';
const MQTT_TOPIC = process.env.MQTT_TOPIC || 'tarlapusula/+/telemetry';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!MQTT_BROKER_URL || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('MQTT_BROKER_URL, SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const finite = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const firstFinite = (...values) => {
  for (const value of values) {
    const number = finite(value);
    if (number !== null) return number;
  }
  return null;
};

function deviceUidFromTopic(topic) {
  const parts = String(topic || '').split('/');
  if (parts.length < 3 || parts[0] !== 'tarlapusula' || parts[2] !== 'telemetry') return '';
  return String(parts[1] || '').trim();
}

function normalizedObservation(payload) {
  const observedAtRaw = payload.observed_at ?? payload.observedAt ?? payload.timestamp ?? new Date().toISOString();
  const observedAt = Number.isFinite(Date.parse(String(observedAtRaw)))
    ? new Date(String(observedAtRaw)).toISOString()
    : new Date().toISOString();

  return {
    observedAt,
    airTemperatureC: firstFinite(payload.air_temperature_c, payload.airTemperatureC, payload.temperature_c, payload.temperature),
    relativeHumidityPct: firstFinite(payload.relative_humidity_pct, payload.relativeHumidityPct, payload.humidity_pct, payload.humidity),
    soilMoistureVwc: firstFinite(payload.soil_moisture_vwc, payload.soilMoistureVwc, payload.vwc),
    soilTemperatureC: firstFinite(payload.soil_temperature_c, payload.soilTemperatureC),
    rainfallMm: firstFinite(payload.rainfall_mm, payload.rainMm, payload.rain),
    leafWetnessPct: firstFinite(payload.leaf_wetness_pct, payload.leafWetnessPct),
    pressureKpa: firstFinite(payload.pressure_kpa, payload.pressureKpa),
    flowLMin: firstFinite(payload.flow_l_min, payload.flowLMin, payload.flow),
    batteryPct: firstFinite(payload.battery_pct, payload.batteryPct, payload.battery),
    rssiDbm: firstFinite(payload.rssi_dbm, payload.rssiDbm, payload.rssi),
  };
}

function validateObservation(observation) {
  if (observation.relativeHumidityPct !== null && (observation.relativeHumidityPct < 0 || observation.relativeHumidityPct > 100)) return 'relative_humidity_pct';
  if (observation.soilMoistureVwc !== null && (observation.soilMoistureVwc <= 0 || observation.soilMoistureVwc >= 1)) return 'soil_moisture_vwc';
  if (observation.rainfallMm !== null && observation.rainfallMm < 0) return 'rainfall_mm';
  if (observation.leafWetnessPct !== null && (observation.leafWetnessPct < 0 || observation.leafWetnessPct > 100)) return 'leaf_wetness_pct';
  if (observation.pressureKpa !== null && observation.pressureKpa < 0) return 'pressure_kpa';
  if (observation.flowLMin !== null && observation.flowLMin < 0) return 'flow_l_min';
  if (observation.batteryPct !== null && (observation.batteryPct < 0 || observation.batteryPct > 100)) return 'battery_pct';
  return null;
}

async function ingest(topic, payload) {
  const deviceUid = deviceUidFromTopic(topic);
  if (!deviceUid) return;

  const { data: device, error: deviceError } = await supabase
    .from('field_sensor_devices')
    .select('id,user_id,field_id,device_uid,enabled')
    .eq('device_uid', deviceUid)
    .eq('enabled', true)
    .maybeSingle();

  if (deviceError) throw deviceError;
  if (!device) {
    console.warn(`[mqtt-bridge] kayıtlı/etkin cihaz bulunamadı: ${deviceUid}`);
    return;
  }

  const observation = normalizedObservation(payload);
  const invalid = validateObservation(observation);
  if (invalid) {
    console.warn(`[mqtt-bridge] geçersiz ${invalid}: ${deviceUid}`);
    return;
  }

  const hasMetric = Object.entries(observation)
    .some(([key, value]) => key !== 'observedAt' && value !== null);
  if (!hasMetric) {
    console.warn(`[mqtt-bridge] metrik içermeyen payload atlandı: ${deviceUid}`);
    return;
  }

  const { error } = await supabase.from('field_sensor_observations').insert({
    user_id: device.user_id,
    field_id: device.field_id,
    device_id: device.id,
    observed_at: observation.observedAt,
    air_temperature_c: observation.airTemperatureC,
    relative_humidity_pct: observation.relativeHumidityPct,
    soil_moisture_vwc: observation.soilMoistureVwc,
    soil_temperature_c: observation.soilTemperatureC,
    rainfall_mm: observation.rainfallMm,
    leaf_wetness_pct: observation.leafWetnessPct,
    pressure_kpa: observation.pressureKpa,
    flow_l_min: observation.flowLMin,
    battery_pct: observation.batteryPct,
    rssi_dbm: observation.rssiDbm,
    raw_payload: payload,
  });

  if (error) throw error;
  console.log(`[mqtt-bridge] ${deviceUid} · ${observation.observedAt}`);
}

const client = mqtt.connect(MQTT_BROKER_URL, {
  username: MQTT_USERNAME || undefined,
  password: MQTT_PASSWORD || undefined,
  reconnectPeriod: 5_000,
  connectTimeout: 20_000,
  clean: true,
});

client.on('connect', () => {
  console.log(`[mqtt-bridge] broker bağlı · topic ${MQTT_TOPIC}`);
  client.subscribe(MQTT_TOPIC, { qos: 1 }, (error) => {
    if (error) console.error('[mqtt-bridge] subscribe hatası', error);
  });
});

client.on('message', (topic, buffer) => {
  let payload;
  try {
    payload = JSON.parse(buffer.toString('utf8'));
  } catch {
    console.warn(`[mqtt-bridge] JSON olmayan payload atlandı: ${topic}`);
    return;
  }
  void ingest(topic, payload).catch((error) => {
    console.error('[mqtt-bridge] ingest hatası', error instanceof Error ? error.message : error);
  });
});

client.on('error', (error) => console.error('[mqtt-bridge] mqtt hata', error.message));
