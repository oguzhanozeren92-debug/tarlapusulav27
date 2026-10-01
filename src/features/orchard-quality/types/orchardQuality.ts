export type OrchardQualityMetric = {
  key: string;
  label: string;
  value: string;
  explanation: string;
};

export type OrchardQualitySummary = {
  status: 'measured' | 'not_measured' | 'unavailable';
  headline: string;
  meaning: string;
  measuredAt: string | null;
  harvestDate: string | null;
  metrics: OrchardQualityMetric[];
  evidence: string[];
  warnings: string[];
};
