export type StorageRiskLevel = 'unknown' | 'low' | 'attention' | 'high';
export type StorageMycotoxinFamily = 'aflatoxin-relevant' | 'general-mold' | 'not-classified';

export type CropStorageLot = {
  id: string;
  userId: string;
  fieldId: string | null;
  crop: string;
  harvestDate: string | null;
  storedAt: string;
  quantityKg: number | null;
  productMoisturePct: number | null;
  storageType: string | null;
  active: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StorageEnvironmentObservation = {
  id: string;
  lotId: string;
  userId: string;
  observedAt: string;
  temperatureC: number | null;
  relativeHumidityPct: number | null;
  productMoisturePct: number | null;
  source: 'manual' | 'sensor';
  notes: string | null;
};

export type StorageRiskLotAssessment = {
  lot: CropStorageLot;
  latestObservation: StorageEnvironmentObservation | null;
  riskLevel: StorageRiskLevel;
  mycotoxinFamily: StorageMycotoxinFamily;
  durationDays: number;
  evidence: string[];
  warnings: string[];
  action: string;
};

export type StorageRiskSnapshot = {
  version: '18.0';
  fieldId: string | null;
  status: 'ready' | 'needs_data' | 'no_lots';
  riskLevel: StorageRiskLevel;
  lotCount: number;
  highRiskLotCount: number;
  attentionLotCount: number;
  lots: StorageRiskLotAssessment[];
  evidence: string[];
  guardrails: string[];
  generatedAt: string;
};
