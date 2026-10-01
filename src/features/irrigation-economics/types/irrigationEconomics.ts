import type { IrrigationDecisionResult } from '../../irrigation/types/irrigationDecision';

export type IrrigationEconomicsProfile = {
  fieldId: string;
  irrigationEfficiencyPct: number | null;
  pumpPowerKw: number | null;
  pumpFlowM3Hour: number | null;
  energyPriceTryKwh: number | null;
  cropPriceTryKg: number | null;
  updatedAt: string | null;
};

export type IrrigationEconomicsSnapshot = {
  version: '19.0';
  fieldId: string;
  status: 'ready' | 'partial' | 'needs_data' | 'not_applicable';
  decisionCode: IrrigationDecisionResult['decision'] | null;
  profile: IrrigationEconomicsProfile;
  recommended: {
    netWaterMm: number | null;
    grossWaterMm: number | null;
    grossWaterM3Ha: number | null;
    totalGrossWaterM3: number | null;
    pumpHours: number | null;
    energyKwh: number | null;
    energyCostTry: number | null;
  };
  season: {
    recordedIrrigationM3: number | null;
    observedYieldKg: number | null;
    waterProductivityKgM3: number | null;
  };
  economicBenefit: {
    status: 'not_computable_without_yield_response';
    valueTry: null;
    reason: string;
  };
  evidence: string[];
  missing: string[];
  guardrails: string[];
  generatedAt: string;
};
