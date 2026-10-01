import type { WeatherForecastDay } from '../../../types';

export type HarvestReadinessStatus = 'harvested' | 'window' | 'approaching' | 'early' | 'insufficient';

export type HarvestWorkDay = {
  date: string;
  label: 'uygun' | 'temkinli' | 'uygun_degil';
  precipitationMm: number | null;
  precipitationProbabilityPct: number | null;
  windKmh: number | null;
  reason: string;
};

export type HarvestReadinessSnapshot = {
  version: '14.0';
  fieldId: string;
  crop: string;
  status: HarvestReadinessStatus;
  headline: string;
  meaning: string;
  expectedHarvestDate: string | null;
  daysToExpectedHarvest: number | null;
  phenologyStage: string | null;
  orchardStage: string | null;
  fruitLoad: string | null;
  dataConfidence: 'high' | 'medium' | 'low' | 'unknown';
  workWeather: {
    status: 'ready' | 'partial' | 'unavailable';
    bestDay: HarvestWorkDay | null;
    days: HarvestWorkDay[];
    note: string;
  };
  evidence: string[];
  warnings: string[];
  generatedAt: string;
};

export type HarvestReadinessInput = {
  fieldId: string;
  crop: string;
  actualHarvestDate?: string | null;
  expectedHarvestDate?: string | null;
  daysToExpectedHarvest?: number | null;
  phenologyStage?: string | null;
  orchardStage?: string | null;
  fruitLoad?: string | null;
  yieldDataQuality?: 'good' | 'partial' | 'insufficient';
  forecast?: WeatherForecastDay[];
  now?: Date;
};
