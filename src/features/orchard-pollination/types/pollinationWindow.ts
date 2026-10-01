export type PollinationMode = 'insect' | 'wind' | 'unsupported';
export type PollinationHourStatus = 'good' | 'watch' | 'poor';

export type PollinationForecastHour = {
  time: number;
  temperatureC: number | null;
  windKmh: number | null;
  gustKmh: number | null;
  rainChance: number | null;
  rainMm: number | null;
  humidity: number | null;
  isDay: boolean | null;
};

export type PollinationEvaluatedHour = PollinationForecastHour & {
  score: number;
  status: PollinationHourStatus;
  limitingFactor: string | null;
};

export type PollinationWindow = {
  from: number;
  to: number;
  status: 'good' | 'watch';
  averageScore: number;
  limitingFactor: string | null;
};

export type PollinationDay = {
  date: string;
  bestStatus: 'good' | 'watch' | 'poor';
  bestScore: number;
  bestWindow: PollinationWindow | null;
  limitingFactor: string | null;
};

export type PollinationWindowSnapshot = {
  version: 'pollination-v1';
  fieldId: string;
  crop: string;
  mode: PollinationMode;
  modeLabel: string;
  floweringTreeCount: number;
  floweringEvidence: 'confirmed' | 'not_recorded';
  timezone: string;
  generatedAt: string;
  updatedAt: number;
  today: PollinationDay | null;
  days: PollinationDay[];
  windows: PollinationWindow[];
  evidence: string[];
  warnings: string[];
};
