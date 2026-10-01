import type { YieldHarvestQualitySnapshot } from './yieldHarvestQuality';

export type YieldSourceKind =
  | 'perennial_yields'
  | 'harvest_operations'
  | 'none';

export type HarvestDateSourceKind =
  | 'perennial_yields'
  | 'field_seasons'
  | 'harvest_operations'
  | 'phenology'
  | 'none';

export type FieldYieldHarvestQualityProvenance = {
  currentYieldRecordId: string | null;
  currentSeasonRecordId: string | null;
  currentHarvestOperationIds: string[];
  currentHarvestQuantityOperationIds: string[];
  qualityMeasurementRecordId: string | null;
};

export type FieldYieldHarvestQualitySources = {
  adapterVersion: '15.0';
  canonicalFieldLoaded: boolean;
  cropCycle: 'annual' | 'perennial' | 'unknown';
  areaDecare: number | null;
  yieldSource: YieldSourceKind;
  harvestDateSource: HarvestDateSourceKind;
  perennialYieldRecords: number;
  seasonRecords: number;
  harvestOperations: number;
  harvestOperationsWithUsableQuantity: number;
  qualityMeasurementLoaded: boolean;
  phenologyLoaded: boolean;
  phenologyStage: string | null;
  ensembleSupportLoaded: boolean;
  warnings: string[];
  provenance: FieldYieldHarvestQualityProvenance;
};

export type FieldYieldHarvestQualityLiveSnapshot = {
  fieldId: string;
  generatedAt: string;
  snapshot: YieldHarvestQualitySnapshot;
  sources: FieldYieldHarvestQualitySources;
};
