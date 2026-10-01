import type {
  HomeDecisionConfidence,
  HomeDecisionEvent,
  HomeDecisionSource,
  HomeDecisionSignalStatus,
  HomeDecisionTarget,
} from './homeDecision';
import type { ScientificAuthorityResolution } from '../../scientific-engine/types/scientificEngine';

export type ModelSignalStatus = HomeDecisionSignalStatus;

export type ModelSignalQualityFlag =
  | 'missing-evidence'
  | 'confidence-not-declared'
  | 'missing-observation-date'
  | 'invalid-observation-date'
  | 'future-observation-date'
  | 'missing-freshness-window'
  | 'stale-observation';

export type ModelSignalFreshness = {
  observedAt: string | null;
  evaluatedAt: string;
  ageHours: number | null;
  maxAgeHours: number | null;
  state: 'current' | 'stale' | 'unknown' | 'invalid' | 'future';
};

export type ModelSignalRecommendation = {
  title: string;
  detail: string;
  target: HomeDecisionTarget;
};

/**
 * Bütün karar/model çıktılarının ortak taşıma sözleşmesi.
 * Tarımsal hesabı yeniden yapmaz; kaynağı, kanıtı, güncelliği ve hangi
 * bilimsel motorun nihai otorite olduğunu izlenebilir biçimde taşır.
 */
export type ModelGatewayEnvelope = {
  schemaVersion: '1.0';
  signalId: string;
  fieldId: string;
  source: HomeDecisionSource;
  sourceModel: string;
  status: ModelSignalStatus;
  confidence: HomeDecisionConfidence;
  evidence: string[];
  quality: {
    declaredConfidence: HomeDecisionConfidence | null;
    evidenceCount: number;
    flags: ModelSignalQualityFlag[];
  };
  freshness: ModelSignalFreshness;
  authority: ScientificAuthorityResolution;
  recommendation: ModelSignalRecommendation;
  severity: HomeDecisionEvent['severity'];
  priority: number;
};

export type HarmonizedHomeDecisionEvent = HomeDecisionEvent & {
  gateway: ModelGatewayEnvelope;
};
