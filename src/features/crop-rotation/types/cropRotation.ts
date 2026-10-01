export type CropRotationFamily =
  | 'cereal'
  | 'legume'
  | 'oilseed'
  | 'fiber'
  | 'root_tuber'
  | 'industrial'
  | 'forage'
  | 'rice'
  | 'other';

export type CropRotationWaterDemand = 'low' | 'medium' | 'high' | 'unknown';
export type CropRotationNitrogenRole = 'benefit' | 'neutral' | 'demanding' | 'unknown';
export type CropRotationWaterPolicy = 'auto' | 'conservative' | 'unrestricted';

export type CropRotationCropProfile = {
  key: string;
  label: string;
  aliases: string[];
  family: CropRotationFamily;
  waterDemand: CropRotationWaterDemand;
  nitrogenRole: CropRotationNitrogenRole;
  agronomicTags: string[];
};

export type CropRotationHistoryItem = {
  year: number;
  crop: string;
  cropKey: string | null;
  family: CropRotationFamily | 'unknown';
  plantingDate: string | null;
  harvestDate: string | null;
};

export type CropRotationDiseasePressure = {
  cropKey: string | null;
  family: CropRotationFamily | 'unknown';
  issue: string;
  observedAt: string | null;
  strength: 'medium' | 'high';
  source: 'field-photo' | 'field-data-event';
};

export type CropRotationEconomicsEvidence = {
  cropKey: string;
  observedNetMargin: number;
  sourceLabel: string;
};

export type CropRotationPreferences = {
  horizonYears: 3 | 4 | 5;
  requiredCrops: string[];
  excludedCrops: string[];
  waterPolicy: CropRotationWaterPolicy;
  maxHighWaterYears: number | null;
};

export type CropRotationContext = {
  fieldId: string;
  fieldName: string | null;
  currentCrop: string | null;
  currentCropKey: string | null;
  cropCycle: 'annual' | 'perennial';
  irrigationStatus: 'irrigated' | 'rainfed' | 'partial' | 'unknown';
  history: CropRotationHistoryItem[];
  diseasePressure: CropRotationDiseasePressure[];
  labNitrogenSignal: 'low' | 'not_low' | 'unknown';
  economics: CropRotationEconomicsEvidence[];
  preferences: CropRotationPreferences;
  generatedAt: string;
  warnings: string[];
};

export type CropRotationScoreBreakdown = {
  diversity: number;
  water: number;
  nitrogen: number;
  disease: number;
  economics: number;
  constraints: number;
  total: number;
};

export type CropRotationPlanYear = {
  year: number;
  cropKey: string;
  cropLabel: string;
  family: CropRotationFamily;
  waterDemand: CropRotationWaterDemand;
  nitrogenRole: CropRotationNitrogenRole;
  score: CropRotationScoreBreakdown;
  reasons: string[];
  cautions: string[];
};

export type CropRotationAlternative = {
  id: string;
  totalScore: number;
  crops: Array<{
    year: number;
    cropKey: string;
    cropLabel: string;
  }>;
};

export type CropRotationPlanStatus =
  | 'ready'
  | 'needs_history'
  | 'not_applicable'
  | 'no_feasible_plan'
  | 'error';

export type CropRotationPlan = {
  version: '10.0';
  fieldId: string;
  status: CropRotationPlanStatus;
  generatedAt: string;
  horizonYears: 3 | 4 | 5;
  startYear: number;
  historyYears: number;
  summary: string;
  actionContext: string;
  plan: CropRotationPlanYear[];
  alternatives: CropRotationAlternative[];
  preferences: CropRotationPreferences;
  evidence: string[];
  warnings: string[];
  solver: {
    engine: 'deterministic-constraint-search';
    contract: 'cp-sat-ready-v1';
    productionAuthority: true;
    note: string;
  };
};
