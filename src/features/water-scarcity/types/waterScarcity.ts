import type { PhenologyStage } from '../../phenology/types/phenology';

export type WaterScarcityPlanState =
  | 'needs_data'
  | 'not_applicable'
  | 'normal'
  | 'controlled_reduce'
  | 'protect_water'
  | 'scarcity_plan';

export type WaterScarcityConfidence = 'low' | 'medium' | 'high';
export type WaterSensitivity = 'low' | 'medium' | 'high' | 'unknown';
export type WaterSourceType = 'well' | 'canal' | 'reservoir' | 'tank' | 'allocation' | 'other';

export type FieldWaterBudget = {
  id: string | null;
  fieldId: string;
  periodStart: string;
  periodEnd: string;
  availableWaterM3: number;
  sourceLabel: string | null;
  sourceType: WaterSourceType;
  maxDailyWaterM3: number | null;
  notes: string | null;
  verifiedAt: string | null;
  updatedAt: string | null;
};

export type WaterScarcityPlanSnapshot = {
  version: '23.0';
  fieldId: string;
  state: WaterScarcityPlanState;
  confidence: WaterScarcityConfidence;
  generatedAt: string;

  budget: {
    profile: FieldWaterBudget | null;
    recordedUseM3: number | null;
    remainingWaterM3: number | null;
    unquantifiedIrrigationCount: number;
    irrigationRecordCount: number;
  };

  irrigation: {
    decisionCode: string | null;
    irrigationStatus: string | null;
    netWaterMm: number | null;
    currentNetNeedM3: number | null;
    planningNetNeedM3: number | null;
    grossNeedM3: number | null;
    irrigationEfficiencyPct: number | null;
    projected5DayDeficitMm: number | null;
    coverageRatio: number | null;
    dailyCapacityRatio: number | null;
    physicalCoverageRatio: number | null;
  };

  phenology: {
    stage: PhenologyStage | null;
    stageLabel: string | null;
    sensitivity: WaterSensitivity;
    confidence: string | null;
  };

  climate: {
    forecast5DayCropWaterUseMm: number | null;
    forecast5DayEffectiveRainMm: number | null;
    forecast5DayClimatePressureMm: number | null;
    maxTemperatureC: number | null;
    hotDayCount: number | null;
  };

  headline: string;
  summary: string;
  action: string;
  evidence: string[];
  missing: string[];
  guardrails: string[];
};

export type SaveFieldWaterBudgetInput = {
  periodStart: string;
  periodEnd: string;
  availableWaterM3: number;
  sourceLabel?: string | null;
  sourceType?: WaterSourceType;
  maxDailyWaterM3?: number | null;
  notes?: string | null;
};
