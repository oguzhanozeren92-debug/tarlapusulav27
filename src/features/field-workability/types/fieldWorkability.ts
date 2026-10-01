import type { SoilWaterProfile } from '../../irrigation/types/soilWaterProfile';
import type { FrostPocketSnapshot } from '../../frost-pocket/types/frostPocket';

export type FieldWorkabilityStatus = 'suitable' | 'caution' | 'wait' | 'needs_data';
export type FieldWorkabilityWaterSource = 'verified_measurement' | 'open_meteo_model' | 'missing';

export type FieldWorkabilitySnapshot = {
  version: '21.1';
  fieldId: string;
  status: FieldWorkabilityStatus;
  confidence: 'strong' | 'medium' | 'preliminary';
  headline: string;
  summary: string;
  surfaceWater: {
    source: FieldWorkabilityWaterSource;
    volumetricWaterContent: number | null;
    observedAt: string | null;
    ageHours: number | null;
    fieldCapacityVol: number | null;
    ratioToFieldCapacity: number | null;
    trafficabilityThresholdRatio: number | null;
    thresholdLabel: string | null;
  };
  soil: {
    source: SoilWaterProfile['source'] | null;
    quality: SoilWaterProfile['quality'] | null;
    sandPercent: number | null;
    clayPercent: number | null;
    siltPercent: number | null;
  };
  wetting: {
    lastIrrigationDate: string | null;
    hoursSinceIrrigation: number | null;
    todayRainMm: number | null;
    todayRainChance: number | null;
    rainLast24hMm: number | null;
    rainLast48hMm: number | null;
    rainLast72hMm: number | null;
    forecastNext12hMm: number | null;
    forecastNext12hMaxChance: number | null;
    automaticWeatherSource: 'open_meteo' | 'home_weather' | 'missing';
  };
  terrain: {
    source: FrostPocketSnapshot['terrain']['source'] | null;
    resolutionMeters: number | null;
    meanSlopeDeg: number | null;
    maxSlopeDeg: number | null;
    steepCellShare: number | null;
  };
  evidence: string[];
  guardrails: string[];
  generatedAt: string;
};

export type FieldWorkabilityLoadOptions = {
  rainMm?: number | null;
  rainChance?: number | null;
  terrain?: FrostPocketSnapshot['terrain'] | null;
  now?: Date;
};
