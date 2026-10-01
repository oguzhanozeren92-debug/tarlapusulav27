export type CropModeKey =
  | 'wheat'
  | 'barley'
  | 'maize'
  | 'sunflower'
  | 'cotton'
  | 'hazelnut'
  | 'olive'
  | 'grape'
  | 'almond'
  | 'generic';

export type CropModeModule =
  | 'phenology'
  | 'risk'
  | 'irrigation'
  | 'nutrition'
  | 'pest'
  | 'weed'
  | 'harvest'
  | 'soil'
  | 'satellite'
  | 'weather'
  | 'market';

export type CropModeRisk =
  | 'frost'
  | 'heat'
  | 'drought'
  | 'water_stress'
  | 'fungal_disease'
  | 'pest'
  | 'weed_pressure'
  | 'lodging'
  | 'harvest_weather';

export type CropModeMapLayer =
  | 'ndvi'
  | 'ndre'
  | 'savi'
  | 'gndvi'
  | 'vh'
  | 'vv'
  | 'lst'
  | 'et'
  | 'rain'
  | 'frost';

export type CropModeSummaryCard =
  | 'plant'
  | 'crop_suitability'
  | 'soil'
  | 'irrigation'
  | 'risk'
  | 'data'
  | 'weed'
  | 'yield_harvest';

export type CropModeProfile = {
  key: CropModeKey;
  label: string;
  aliases: string[];
  cropCycle: 'annual' | 'perennial' | 'any';
  supportsDrylandMode: boolean;
  priorityModules: CropModeModule[];
  priorityRisks: CropModeRisk[];
  preferredMapLayers: CropModeMapLayer[];
  summaryCards: CropModeSummaryCard[];
  assistantGoals: string[];
  notificationTopics: string[];
};

export type CropModeRuntimeTag =
  | 'annual'
  | 'perennial'
  | 'rainfed'
  | 'irrigated'
  | 'partial_irrigation'
  | 'dryland'
  | 'bearing'
  | 'non_bearing';

export type CropModeRuntime = {
  schemaVersion: 1;
  modeKey: CropModeKey;
  modeLabel: string;
  cropName: string | null;
  matchedAlias: string | null;
  fallback: boolean;
  cropCycle: 'annual' | 'perennial';
  subMode: 'standard' | 'dryland' | 'non_bearing';
  runtimeTags: CropModeRuntimeTag[];
  priorityModules: CropModeModule[];
  priorityRisks: CropModeRisk[];
  preferredMapLayers: CropModeMapLayer[];
  summaryCards: CropModeSummaryCard[];
  assistantGoals: string[];
  notificationTopics: string[];
  guardrails: string[];
};
