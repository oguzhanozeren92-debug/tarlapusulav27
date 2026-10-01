export type ScientificEngineFamily =
  | 'data'
  | 'irrigation'
  | 'crop'
  | 'satellite'
  | 'soil'
  | 'risk'
  | 'weed'
  | 'decision'
  | 'ai';

export type ScientificEngineRole =
  | 'input'
  | 'measurement'
  | 'model'
  | 'fusion'
  | 'decision'
  | 'explanation'
  | 'reference';

export type ScientificEngineRollout =
  | 'live'
  | 'shadow'
  | 'pilot'
  | 'reference'
  | 'disabled';

export type ScientificAuthorityLevel =
  | 'primary'
  | 'supporting'
  | 'validation'
  | 'context'
  | 'none';

export type ScientificAuthorityScope =
  | 'irrigation.daily_decision'
  | 'phenology.current_stage'
  | 'satellite.vegetation_interpretation'
  | 'nutrition.field_decision'
  | 'risk.disease_pest'
  | 'yield.harvest_quality'
  | 'crop.rotation_plan'
  | 'orchard.chill_accumulation'
  | 'orchard.tree_observation'
  | 'storage.postharvest_risk'
  | 'irrigation.economics'
  | 'frost.intra_field'
  | 'field.workability'
  | 'irrigation.distribution_screening'
  | 'irrigation.water_scarcity_plan'
  | 'weed.field_observation'
  | 'field.multi_stress_synthesis'
  | 'field.overall_synthesis';

export type ScientificEngineDefinition = {
  engineKey: string;
  label: string;
  family: ScientificEngineFamily;
  role: ScientificEngineRole;
  rollout: ScientificEngineRollout;
  authorityLevel: ScientificAuthorityLevel;
  productionAuthority: boolean;
  userVisible: boolean;
  description: string;
};

export type ScientificAuthorityRule = {
  scope: ScientificAuthorityScope;
  label: string;
  authorityEngineKey: string;
  supportingEngineKeys: string[];
  guardrails: string[];
};

export type ScientificAuthorityResolution = {
  scope: ScientificAuthorityScope | null;
  authorityEngineKey: string | null;
  authorityLabel: string | null;
  sourceEngineKeys: string[];
  supportingEngineKeys: string[];
  productionAuthority: boolean;
  rollout: ScientificEngineRollout | null;
  guardrails: string[];
};

export type ScientificEvidenceStatus =
  | 'ready'
  | 'partial'
  | 'needs_data'
  | 'blocked'
  | 'error';

export type ScientificEvidenceRecord = {
  id: string;
  fieldId: string;
  engineKey: string;
  authorityScope: string | null;
  evidenceKind: string;
  status: ScientificEvidenceStatus;
  productionAuthority: boolean;
  confidence: 'low' | 'medium' | 'high' | 'unknown';
  observedAt: string | null;
  generatedAt: string;
  engineVersion: string | null;
  adapterVersion: string | null;
  evidence: Record<string, unknown>;
  output: Record<string, unknown>;
};

export type ScientificEvidenceSnapshot = {
  fieldId: string;
  generatedAt: string;
  authoritative: ScientificEvidenceRecord[];
  supporting: ScientificEvidenceRecord[];
  byScope: Record<string, {
    authority: ScientificEvidenceRecord | null;
    supporting: ScientificEvidenceRecord[];
  }>;
};
