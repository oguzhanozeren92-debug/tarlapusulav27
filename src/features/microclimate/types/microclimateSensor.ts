export type SensorProtocol = 'mqtt' | 'http' | 'manual';
export type SensorFreshness = 'fresh' | 'stale' | 'offline' | 'no_data';
export type MicroclimateSensorStatus = 'no_devices' | 'waiting' | 'live' | 'stale' | 'attention';
export type MicroclimateSensorConfidence = 'low' | 'medium' | 'strong';

export type FieldSensorDevice = {
  id: string;
  fieldId: string;
  deviceUid: string;
  name: string;
  protocol: SensorProtocol;
  mqttTopic: string | null;
  enabled: boolean;
  soilDepthFromCm: number | null;
  soilDepthToCm: number | null;
  expectedPressureMinKpa: number | null;
  expectedPressureMaxKpa: number | null;
  expectedFlowMinLMin: number | null;
  expectedFlowMaxLMin: number | null;
  lastSeenAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type FieldSensorObservation = {
  id: string;
  fieldId: string;
  deviceId: string;
  observedAt: string;
  airTemperatureC: number | null;
  relativeHumidityPct: number | null;
  soilMoistureVwc: number | null;
  soilTemperatureC: number | null;
  rainfallMm: number | null;
  leafWetnessPct: number | null;
  pressureKpa: number | null;
  flowLMin: number | null;
  batteryPct: number | null;
  rssiDbm: number | null;
  rawPayload: Record<string, unknown>;
  createdAt: string;
};

export type SensorRangeAlert = {
  deviceId: string;
  deviceName: string;
  metric: 'pressure' | 'flow';
  value: number;
  min: number | null;
  max: number | null;
  observedAt: string;
};

export type MicroclimateDeviceState = {
  device: FieldSensorDevice;
  latest: FieldSensorObservation | null;
  freshness: SensorFreshness;
  ageMinutes: number | null;
  rangeAlerts: SensorRangeAlert[];
};

export type MicroclimateSensorSnapshot = {
  fieldId: string;
  status: MicroclimateSensorStatus;
  confidence: MicroclimateSensorConfidence;
  generatedAt: string;
  deviceCount: number;
  liveDeviceCount: number;
  latestObservedAt: string | null;
  latest: FieldSensorObservation | null;
  devices: MicroclimateDeviceState[];
  rangeAlerts: SensorRangeAlert[];
  headline: string;
  summary: string;
  evidence: string[];
  guardrails: string[];
};

export type SaveFieldSensorDeviceInput = {
  id?: string | null;
  deviceUid: string;
  name: string;
  protocol?: SensorProtocol;
  mqttTopic?: string | null;
  enabled?: boolean;
  soilDepthFromCm?: number | null;
  soilDepthToCm?: number | null;
  expectedPressureMinKpa?: number | null;
  expectedPressureMaxKpa?: number | null;
  expectedFlowMinLMin?: number | null;
  expectedFlowMaxLMin?: number | null;
  metadata?: Record<string, unknown>;
};
