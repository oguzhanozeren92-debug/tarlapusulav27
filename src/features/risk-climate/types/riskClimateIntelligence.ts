export type RiskClimateLevel =
  | 'low'
  | 'moderate'
  | 'high'
  | 'critical'
  | 'unknown';

export type RiskClimateSignalStatus =
  | 'ready'
  | 'supporting'
  | 'needs_data'
  | 'unavailable';

export type RiskClimateSignalKey =
  | 'frost'
  | 'heat'
  | 'drought'
  | 'excess_water'
  | 'salinity'
  | 'hail_post_event'
  | 'disease_weather_window';

export type RiskClimateSignalSensitivity = {
  cropModeKey: string;
  cropName: string | null;
  phenologyStage: string | null;
  phenologyStageLabel: string | null;
  factor: number;
  applied: boolean;
  reason: string;
};

export type RiskClimateSignal = {
  key: RiskClimateSignalKey;
  label: string;
  status: RiskClimateSignalStatus;
  level: RiskClimateLevel;
  score: number | null;
  baseScore: number | null;
  sensitivity: RiskClimateSignalSensitivity | null;
  headline: string;
  summary: string;
  evidence: string[];
  action: string;
  confidence: 'low' | 'medium' | 'high' | 'unknown';
  productionAuthority: boolean;
};

export type RiskClimateSourceState = {
  key:
    | 'era5_land'
    | 'chirps'
    | 'forecast'
    | 'hydrosheds'
    | 'jrc_surface_water'
    | 'worldclim'
    | 'disease_risk_engine';
  label: string;
  status: 'ready' | 'partial' | 'pending' | 'not_connected' | 'unavailable';
  role: string;
};

export type RiskClimateWorldClimReference = {
  status: 'ready' | 'unavailable' | 'error';
  source: 'WorldClim 2.1';
  baselinePeriod: '1970-2000';
  resolution: '30 arc-seconds';
  variables: {
    annualMeanTemperatureC: number | null;
    maxTemperatureWarmestMonthC: number | null;
    minTemperatureColdestMonthC: number | null;
    annualPrecipitationMm: number | null;
    precipitationWettestMonthMm: number | null;
    precipitationDriestMonthMm: number | null;
    precipitationSeasonalityCv: number | null;
  };
  evidence: string[];
  warnings: string[];
  productionAuthority: false;
};

export type RiskClimateAnomalyMemoryCompact = {
  version: '1.0';
  status: 'ready' | 'partial' | 'needs_data';
  latest: {
    dateKey: string;
    seasonState:
      | 'warmer_drier'
      | 'warmer_wetter'
      | 'cooler_drier'
      | 'cooler_wetter'
      | 'warmer'
      | 'cooler'
      | 'drier'
      | 'wetter'
      | 'near_normal'
      | 'unknown';
    temperatureAnomalyC: number | null;
    precipitationDeficitPct: number | null;
    waterBalanceAnomalyMm: number | null;
    soilMoisture7To28Percentile: number | null;
  } | null;
  historyCount: number;
  persistence: {
    warmSnapshots: number;
    coolSnapshots: number;
    drySnapshots: number;
    wetSnapshots: number;
    consecutiveDrySnapshots: number;
    consecutiveWarmSnapshots: number;
    persistentDry: boolean;
    persistentWarm: boolean;
  };
  trend: 'drying' | 'wetting' | 'warming' | 'cooling' | 'mixed' | 'stable' | 'unknown';
  summary: string;
  evidence: string[];
  guardrails: {
    oneSnapshotPerDay: true;
    worldClimIsContextNotMonthlyNormal: true;
    memoryDoesNotAlterShortTermRiskScore: true;
    noAnomalyWithoutBaselineEvidence: true;
  };
  generatedAt: string;
};

export type RiskClimateMemoryNarrative = {
  status: 'ready' | 'partial' | 'needs_data';
  headline: string;
  summary: string;
  evidence: string[];
  actionContext: string | null;
  persistenceKey: 'warm_dry' | 'dry' | 'warm' | 'wet' | 'near_normal' | 'mixed' | 'unknown';
  changesRiskScore: false;
};

export type RiskClimateIntelligence = {
  version: '12.6';
  fieldId: string;
  status: 'ready' | 'partial' | 'needs_data';
  productionAuthority: true;
  signals: RiskClimateSignal[];
  sourceStates: RiskClimateSourceState[];
  topSignal: RiskClimateSignal | null;
  worldClimReference: RiskClimateWorldClimReference | null;
  climateAnomalyMemory: RiskClimateAnomalyMemoryCompact | null;
  memoryNarrative: RiskClimateMemoryNarrative | null;
  guardrails: {
    worldClimNotFabricated: true;
    jrcIsHistoricalContextOnly: true;
    salinityNeedsMeasuredOrValidatedInput: true;
    hailNeedsObservedEvent: true;
    diseaseDiagnosisAuthority: false;
    rawClimateScorePreserved: true;
    phenologySensitivityDoesNotCreateDiagnosis: true;
    worldClimReferenceDoesNotAlterShortTermScore: true;
    anomalyMemoryDoesNotAlterShortTermScore: true;
  };
  generatedAt: string;
};
