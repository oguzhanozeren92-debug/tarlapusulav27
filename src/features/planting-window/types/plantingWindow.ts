export type PlantingWindowScenarioKey = 'early' | 'anchor' | 'late';

export type PlantingWindowPhenologyStage =
  | 'establishment'
  | 'vegetative'
  | 'reproductive'
  | 'maturation'
  | 'harvest_window';

export type PlantingWindowScenarioClimate = {
  evaluatedSeasons: number;
  establishmentDays: number;
  meanRainMm: number | null;
  medianRainMm: number | null;
  meanMinTempC: number | null;
  meanMaxTempC: number | null;
  frostSeasonFrequencyPercent: number | null;
  heatSeasonFrequencyPercent: number | null;
  meanLongestDrySpellDays: number | null;
};

export type PlantingWindowStageExposure = {
  stage: PlantingWindowPhenologyStage;
  stageLabel: string;
  evaluatedSeasons: number;
  meanStageDays: number | null;
  meanRainMm: number | null;
  frostSeasonFrequencyPercent: number | null;
  heatSeasonFrequencyPercent: number | null;
  meanLongestDrySpellDays: number | null;
  earliestEstimatedStartDate: string | null;
  latestEstimatedEndDate: string | null;
};

export type PlantingEscapeCalendar = {
  status: 'ready' | 'needs_data';
  seasonDurationDays: number | null;
  durationSource: 'field_history_median' | 'latest_complete_season' | 'none';
  historicalDurationCount: number;
  stages: PlantingWindowStageExposure[];
  criticalStage: PlantingWindowStageExposure | null;
  evidence: string[];
};

export type PlantingWindowScenario = {
  key: PlantingWindowScenarioKey;
  label: string;
  plantingDate: string;
  offsetDays: number;
  climate: PlantingWindowScenarioClimate | null;
  escapeCalendar: PlantingEscapeCalendar;
  evidence: string[];
};

export type WheatPlantingWindowResult = {
  version: '13.2';
  fieldId: string;
  crop: string | null;
  supported: boolean;
  status: 'ready' | 'needs_data' | 'unsupported' | 'error';
  anchor: {
    date: string | null;
    source: 'field_history_median' | 'latest_real_planting' | 'none';
    historicalPlantingCount: number;
  };
  seasonDuration: {
    days: number | null;
    source: 'field_history_median' | 'latest_complete_season' | 'none';
    historicalDurationCount: number;
  };
  scenarios: PlantingWindowScenario[];
  guardrails: {
    scenarioNotRecommendation: true;
    realPlantingRecordNeverOverwritten: true;
    noSyntheticVariety: true;
    weatherExposureNotDiseaseDiagnosis: true;
    stageExposureIsPlanningEstimate: true;
    stageExposureNotYieldLossPrediction: true;
    noStageEstimateWithoutRealSeasonDuration: true;
  };
  missingInputs: string[];
  generatedAt: string;
  note: string;
};

export type PlantingWindowRelativeExposure =
  | 'lower'
  | 'middle'
  | 'higher'
  | 'similar'
  | 'unknown';

export type PlantingWindowScenarioDecision = {
  key: PlantingWindowScenarioKey;
  label: string;
  plantingDate: string;
  relativeExposureIndex: number | null;
  relativeExposure: PlantingWindowRelativeExposure;
  headline: string;
  tradeoffs: string[];
  evidence: string[];
};

export type PlantingWindowDecisionResult = {
  version: '13.3';
  sourceVersion: WheatPlantingWindowResult['version'];
  fieldId: string;
  crop: string | null;
  supported: boolean;
  status: 'ready' | 'needs_data' | 'unsupported' | 'error';
  comparisonBasis: 'relative_historical_exposure';
  scenarios: PlantingWindowScenarioDecision[];
  lowerHistoricalExposureScenarioKey: PlantingWindowScenarioKey | null;
  summary: string;
  actionContext: string;
  evidence: string[];
  guardrails: {
    lowerExposureIsNotRecommendation: true;
    noYieldBenefitClaim: true;
    noDiseaseDiagnosisFromWeather: true;
    realPlantingRecordNeverOverwritten: true;
    relativeIndexIsNotRiskProbability: true;
  };
  missingInputs: string[];
  generatedAt: string;
};
