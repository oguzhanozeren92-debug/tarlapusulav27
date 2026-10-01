export type TaskMapPrescriptionState = 'none' | 'blocked' | 'verified';
export type TaskMapZoneKind =
  | 'field-check'
  | 'photo-check'
  | 'irrigation-check'
  | 'sampling'
  | 'verified-application';

export type TaskMapZone = {
  taskId: string;
  taskKey: string | null;
  title: string;
  description: string | null;
  source: string;
  actionTarget: string | null;
  priority: number;
  rewardPoints: number;
  direction: string | null;
  geometry: unknown | null;
  bounds: unknown | null;
  sourceLayer: string;
  kind: TaskMapZoneKind;
  prescriptionState: TaskMapPrescriptionState;
  prescriptionLabel: string | null;
  prescriptionRate: number | null;
  prescriptionUnit: string | null;
  prescriptionAuthority: string | null;
  evidence: string[];
};

export type TaskMapSnapshot = {
  version: '25.0';
  fieldId: string;
  status: 'ready' | 'empty';
  openTaskCount: number;
  spatialTaskCount: number;
  verifiedPrescriptionCount: number;
  blockedPrescriptionCount: number;
  zones: TaskMapZone[];
  guardrails: {
    taskAreaIsNotAutomaticPrescription: true;
    coarseDirectionIsNotMachineGuidanceGeometry: true;
    numericRateRequiresVerifiedAuthority: true;
    chemicalSelectionIsNeverGeneratedFromRemoteSignalAlone: true;
  };
  generatedAt: string;
};
