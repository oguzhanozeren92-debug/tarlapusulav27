export type YieldHistoryPoint = {
  year: number;
  yieldKg: number | null;
  harvestDate?: string | null;
};

export type YieldEnsembleMember = {
  key: 'dssat' | 'aquacrop' | 'pcse-wofost' | 'sl2p-biophysics' | 'yield4cast' | 'qualitree' | 'history';
  label: string;
  status: 'ready' | 'context' | 'blocked' | 'unavailable' | 'method_reference';
  yieldKgHa: number | null;
  harvestDate: string | null;
  weight: number;
  productionAuthority: false;
  note: string;
};

export type YieldForecastEnvelope = {
  status: 'observed' | 'model_supported' | 'historical_context' | 'unavailable';
  scope: 'wheat_first' | 'general_observed_only';
  lowerKgHa: number | null;
  centralKgHa: number | null;
  upperKgHa: number | null;
  rangeKind: 'observed' | 'evidence_envelope' | 'none';
  confidence: 'high' | 'medium' | 'low' | 'unknown';
  modelMemberCount: number;
  historicalSampleCount: number;
  uncertaintyNote: string;
  actualOverridesModels: true;
};

export type HarvestTimingConsensus = {
  status: 'actual' | 'consensus' | 'phenology_only' | 'model_context' | 'unavailable';
  date: string | null;
  lowerDate: string | null;
  upperDate: string | null;
  confidence: 'high' | 'medium' | 'low' | 'unknown';
  memberCount: number;
  note: string;
};

export type YieldHarvestQualityInput = {
  fieldId: string;
  crop: string;
  areaHa?: number | null;
  cropCycle?: 'annual' | 'perennial' | string | null;
  bearing?: boolean | null;
  currentYear?: number;
  currentStage?: string | null;
  expectedHarvestDate?: string | null;
  actualHarvestDate?: string | null;
  currentYieldKg?: number | null;
  history?: YieldHistoryPoint[];
  qualityMeasurements?: Record<string, number | string | null | undefined> | null;
};

export type YieldHarvestQualityStatus =
  | 'needs_data'
  | 'pre_harvest'
  | 'harvest_window'
  | 'harvested';

export type YieldHarvestQualitySnapshot = {
  engine: 'yield-harvest-engine';
  engineVersion: '15.0';
  fieldId: string;
  crop: string;
  status: YieldHarvestQualityStatus;
  generatedAt: string;
  observed: {
    yieldKg: number | null;
    yieldKgHa: number | null;
    harvestDate: string | null;
  };
  history: {
    sampleCount: number;
    averageYieldKg: number | null;
    averageYieldKgHa: number | null;
    minYieldKg: number | null;
    maxYieldKg: number | null;
    trend: 'rising' | 'falling' | 'stable' | 'insufficient';
  };
  harvest: {
    expectedDate: string | null;
    actualDate: string | null;
    daysToExpectedHarvest: number | null;
    stage: string | null;
  };
  quality: {
    status: 'measured' | 'not_measured';
    measurements: Record<string, number | string | null>;
    note: string;
  };
  ensemble?: {
    forecast: YieldForecastEnvelope;
    harvestTiming: HarvestTimingConsensus;
    members: YieldEnsembleMember[];
    supportingEvidence: string[];
    methodReferences: Array<{
      key: 'yield4cast' | 'qualitree' | 'prosail';
      runtimeAvailable: false;
      productionAuthority: false;
      note: string;
    }>;
  };
  authority: {
    scope: 'yield.harvest_quality';
    productionAuthority: true;
    supportingModels: Array<'dssat' | 'aquacrop' | 'pcse-wofost' | 'sl2p-biophysics' | 'yield4cast' | 'qualitree'>;
  };
  dataQuality: 'good' | 'partial' | 'insufficient';
  notes: string[];
};
