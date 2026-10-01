export type OrchardChillStatus =
  | 'not_applicable'
  | 'loading'
  | 'partial'
  | 'ready'
  | 'error';

export type OrchardChillModelMetrics = {
  classicHours: number;
  utahUnits: number;
  chillPortions: number;
};

export type OrchardChillOfficialReference = {
  status: 'ready' | 'unavailable' | 'not_configured';
  source: 'MGM_BISIP';
  stationId: string | null;
  stationName: string | null;
  city: string | null;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
  elevationM: number | null;
  officialUrl: string;
  methodLabel: 'Klasik Yöntem · 0–7,2 °C';
  officialObservedHours: number | null;
  officialRequirementHours: number | null;
  officialRemainingHours: number | null;
  note: string;
};

export type OrchardChillSnapshot = {
  version: '11.0';
  fieldId: string;
  crop: string;
  variety: string | null;
  applicable: boolean;
  status: Exclude<OrchardChillStatus, 'loading' | 'error'>;
  windowStart: string;
  windowEnd: string;
  latitude: number | null;
  longitude: number | null;
  localMetrics: OrchardChillModelMetrics | null;
  expectedHourlySamples: number;
  actualHourlySamples: number;
  coveragePct: number | null;
  officialReference: OrchardChillOfficialReference;
  evidence: string[];
  warnings: string[];
  generatedAt: string;
};

export type OrchardChillCompactContext = {
  status: OrchardChillSnapshot['status'];
  crop: string;
  variety: string | null;
  window: string;
  classicHours: number | null;
  utahUnits: number | null;
  chillPortions: number | null;
  coveragePct: number | null;
  mgmStation: string | null;
  mgmOfficialUrl: string;
  note: string;
};
