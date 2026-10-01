export type OrchardTrackingZoneTreeCountSource =
  | 'manual'
  | 'spacing'
  | 'image'
  | 'unknown';

export type OrchardTrackingZoneStorageMode = 'cloud' | 'local';

export type OrchardTrackingZonePolygon = {
  type: 'Polygon';
  coordinates: number[][][];
};

export type OrchardTrackingZoneRecord = {
  id: string;
  fieldId: string;
  name: string;
  geometry: OrchardTrackingZonePolygon;
  areaM2: number;
  estimatedTreeCount: number | null;
  treeCountSource: OrchardTrackingZoneTreeCountSource;
  rowSpacingM: number | null;
  treeSpacingM: number | null;
  notes: string | null;
  storageMode: OrchardTrackingZoneStorageMode;
  createdAt: string;
  updatedAt: string;
};

export type OrchardTrackingZoneSaveInput = {
  fieldId: string;
  name: string;
  geometry: OrchardTrackingZonePolygon;
  estimatedTreeCount?: number | null;
  treeCountSource?: OrchardTrackingZoneTreeCountSource;
  rowSpacingM?: number | null;
  treeSpacingM?: number | null;
  notes?: string | null;
};

export type OrchardTrackingZoneInsightStatus =
  | 'attention'
  | 'watch'
  | 'similar'
  | 'stronger'
  | 'insufficient';

export type OrchardTrackingZoneInsight = {
  status: OrchardTrackingZoneInsightStatus;
  headline: string;
  summary: string;
  zoneNdviMean: number | null;
  fieldNdviMean: number | null;
  difference: number | null;
  satelliteDate: string | null;
  evidence: string[];
  warnings: string[];
};
