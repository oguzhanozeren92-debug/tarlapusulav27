export type MultiStressFamily =
  | 'water_deficit'
  | 'water_excess'
  | 'heat'
  | 'frost'
  | 'nutrition'
  | 'disease_pest'
  | 'weed'
  | 'salinity';

export type MultiStressLevel = 'warning' | 'danger';
export type MultiStressConfidence = 'preliminary' | 'medium' | 'strong';

export type MultiStressFamilySignal = {
  family: MultiStressFamily;
  label: string;
  level: MultiStressLevel;
  confidence: MultiStressConfidence;
  score: number;
  sources: string[];
  sourceModels: string[];
  eventIds: string[];
  evidence: string[];
  observedAt: string | null;
};

export type MultiStressSynthesis = {
  version: '26.0';
  fieldId: string;
  status: 'none' | 'combined' | 'conflicted';
  dominantFamily: MultiStressFamily | null;
  secondaryFamilies: MultiStressFamily[];
  signals: MultiStressFamilySignal[];
  supportingSatelliteEvidence: string[];
  headline: string;
  summary: string;
  action: string;
  evidence: string[];
  warnings: string[];
  confidence: MultiStressConfidence;
  observedAt: string | null;
  generatedAt: string;
  productionAuthority: false;
};
