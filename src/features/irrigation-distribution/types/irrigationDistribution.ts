export type IrrigationDistributionConfidence = 'low' | 'medium' | 'strong';

export type IrrigationDistributionObservation = {
  id?: string;
  irrigationOperationId: string;
  irrigationDate: string;
  satelliteDate: string;
  area: string | null;
  assessmentStatus: 'normal' | 'suspect' | 'recurrent';
  anomalyScore: number;
  confidence: IrrigationDistributionConfidence;
  rainBetweenMm: number | null;
  evidence: string[];
  spatialSignature: Record<string, unknown>;
  createdAt?: string | null;
};

export type IrrigationDistributionSnapshot = {
  fieldId: string;
  status: 'needs_data' | 'waiting_for_satellite' | 'normal' | 'suspect' | 'recurrent';
  confidence: IrrigationDistributionConfidence;
  generatedAt: string;
  latestIrrigation: { operationId: string; date: string; amount: number | null; unit: string | null } | null;
  satelliteDate: string | null;
  daysAfterIrrigation: number | null;
  area: string | null;
  anomalyScore: number | null;
  repeatCount: number;
  assessedIrrigationCount: number;
  rainBetweenMm: number | null;
  headline: string;
  summary: string;
  evidence: string[];
  guardrails: string[];
  history: IrrigationDistributionObservation[];
};
