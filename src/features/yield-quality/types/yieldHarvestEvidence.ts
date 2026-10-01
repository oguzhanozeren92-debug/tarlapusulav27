import type { FieldYieldHarvestQualitySources } from './fieldYieldHarvestQuality';
import type { HarvestTimingConsensus, YieldForecastEnvelope, YieldHarvestQualitySnapshot } from './yieldHarvestQuality';

export type YieldHarvestEvidenceStatus = 'ready' | 'partial' | 'needs_data';
export type YieldHarvestEvidenceConfidence = 'low' | 'medium' | 'high';

export type YieldHarvestScientificEvidence = {
  id: string;
  fieldId: string;
  generatedAt: string;
  observedAt: string | null;
  status: YieldHarvestEvidenceStatus;
  confidence: YieldHarvestEvidenceConfidence;
  snapshot: YieldHarvestQualitySnapshot;
  sources: FieldYieldHarvestQualitySources;
};

export type YieldHarvestTodaySignal = {
  eligible: boolean;
  priority: number;
  label: 'HASAT';
  title: string;
  detail: string;
  tone: 'neutral' | 'green' | 'amber' | 'blue';
  target: 'calendar' | 'ai';
};

export type YieldHarvestConsumerContext = {
  fieldId: string;
  evidenceId: string;
  generatedAt: string;
  authority: {
    scope: 'yield.harvest_quality';
    engineKey: 'yield-harvest-engine';
    productionAuthority: true;
  };
  pusula: {
    crop: string;
    status: YieldHarvestQualitySnapshot['status'];
    observedYieldKg: number | null;
    observedYieldKgHa: number | null;
    averageYieldKg: number | null;
    averageYieldKgHa: number | null;
    trend: YieldHarvestQualitySnapshot['history']['trend'];
    expectedHarvestDate: string | null;
    actualHarvestDate: string | null;
    daysToExpectedHarvest: number | null;
    qualityStatus: YieldHarvestQualitySnapshot['quality']['status'];
    dataQuality: YieldHarvestQualitySnapshot['dataQuality'];
    notes: string[];
    forecast: YieldForecastEnvelope | null;
    harvestTiming: HarvestTimingConsensus | null;
  };
  today: YieldHarvestTodaySignal;
  pdf: {
    sectionTitle: 'Verim & Hasat';
    dataQuality: YieldHarvestQualitySnapshot['dataQuality'];
    currentYieldKg: number | null;
    currentYieldKgHa: number | null;
    averageYieldKg: number | null;
    trend: YieldHarvestQualitySnapshot['history']['trend'];
    expectedHarvestDate: string | null;
    actualHarvestDate: string | null;
    qualityStatus: YieldHarvestQualitySnapshot['quality']['status'];
    qualityMeasurements: Record<string, number | string | null>;
    ensembleForecast: YieldForecastEnvelope | null;
    harvestTiming: HarvestTimingConsensus | null;
  };
};
