export type OrchardPilotCropKey = 'almond' | 'pistachio';

export type OrchardTreeStage =
  | 'unknown'
  | 'dormancy'
  | 'bud_swell'
  | 'bud_break'
  | 'flowering'
  | 'fruit_set'
  | 'fruit_growth'
  | 'maturation'
  | 'harvest_window'
  | 'leaf_fall';

export type OrchardTreeStressLevel = 'none' | 'low' | 'medium' | 'high' | 'unknown';
export type OrchardTreeWaterStatus = 'normal' | 'watch' | 'stress' | 'unknown';
export type OrchardTreeLoadLevel = 'none' | 'low' | 'medium' | 'high' | 'very_high' | 'unknown';
export type OrchardTreeObservationSource = 'manual' | 'sensor';

export type OrchardTreeRecord = {
  id: string;
  fieldId: string;
  treeCode: string;
  crop: string | null;
  variety: string | null;
  rootstock: string | null;
  plantingYear: number | null;
  latitude: number | null;
  longitude: number | null;
  rowNo: string | null;
  treeNo: string | null;
  canopyDiameterM: number | null;
  canopyHeightM: number | null;
  active: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrchardTreeObservationRecord = {
  id: string;
  fieldId: string;
  treeId: string;
  observedAt: string;
  stage: OrchardTreeStage;
  waterStatus: OrchardTreeWaterStatus;
  stressLevel: OrchardTreeStressLevel;
  flowerIntensity: OrchardTreeLoadLevel;
  fruitLoad: OrchardTreeLoadLevel;
  fruitCountMeasured: number | null;
  yieldKgMeasured: number | null;
  trunkDiameterMm: number | null;
  sapFlowLph: number | null;
  source: OrchardTreeObservationSource;
  notes: string | null;
  createdAt: string;
};

export type OrchardTreeStatus = 'normal' | 'watch' | 'attention' | 'unknown';

export type OrchardTreeMapPoint = {
  treeId: string;
  treeCode: string;
  latitude: number;
  longitude: number;
  status: OrchardTreeStatus;
  latestObservationAt: string | null;
  variety: string | null;
};

export type OrchardAlternanceResult = {
  status: 'insufficient' | 'stable' | 'possible';
  evaluatedTreeCount: number;
  possibleTreeIds: string[];
  evidence: string[];
};

export type OrchardMethodReference = {
  key: 'asymetree' | 'samson' | 'fruitmeasure' | 'mangosense';
  label: string;
  runtimeAvailable: false;
  productionAuthority: false;
  role: 'method_reference';
};

export type OrchardIntelligenceSnapshot = {
  version: '16.0';
  fieldId: string;
  crop: string;
  cropKey: OrchardPilotCropKey | null;
  pilotEnabled: boolean;
  status: 'not_applicable' | 'empty' | 'ready' | 'attention';
  treeCount: number;
  geolocatedTreeCount: number;
  observedTreeCount: number;
  latestObservationAt: string | null;
  recentObservationCount: number;
  stressedTreeCount: number;
  highStressTreeCount: number;
  waterStressTreeCount: number;
  floweringTreeCount: number;
  fruitingTreeCount: number;
  measuredYieldTreeCount: number;
  measuredSensorTreeCount: number;
  alternance: OrchardAlternanceResult;
  trees: OrchardTreeRecord[];
  latestObservations: OrchardTreeObservationRecord[];
  mapPoints: OrchardTreeMapPoint[];
  evidence: string[];
  warnings: string[];
  methodReferences: OrchardMethodReference[];
  generatedAt: string;
};
