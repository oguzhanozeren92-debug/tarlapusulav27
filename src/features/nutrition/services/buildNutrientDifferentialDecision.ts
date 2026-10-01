import type { HomeDecisionEvent } from '../../decision/types/homeDecision';
import type { NutrientDifferentialDiagnosisResult } from './nutrientDifferentialDiagnosis.service';

function fieldControlTask(
  result: NutrientDifferentialDiagnosisResult,
): HomeDecisionEvent['task'] {
  if (!result.triggered) return undefined;

  const period = result.trigger.observedAt?.slice(0, 10) || 'current';
  return {
    taskKey: `nutrient-differential-photo:${period}`,
    actionTarget: 'field-photo',
    rewardPoints: 0,
    rewardRuleKey: null,
    metadata: {
      source: 'nutrient_differential_diagnosis',
      version: result.version,
      requestPhoto: true,
      nitrogenRecommendationBlocked: result.nitrogenGate.recommendationBlocked,
      triggerKind: result.trigger.kind,
      guidance:
        'Zayıf görünen bölgeden yakın plan bitki, genel bitki sırası ve toprak çevresi fotoğrafı çek.',
    },
  };
}

/**
 * 14.1 güvenlik olayı: düşük NDVI görülünce ayrı bir "azot önerisi" üretmez.
 * Mevcut uydu uyarısını neden-ayırma mesajına dönüştürür ve saha doğrulaması ister.
 */
export function buildNutrientDifferentialDecision(
  result: NutrientDifferentialDiagnosisResult | null | undefined,
): HomeDecisionEvent | null {
  if (!result?.triggered || !result.fieldId) return null;

  const needsEvidence = result.status === 'needs_evidence';
  const hasAlternatives = result.status === 'alternative_causes_present';
  const labNitrogen = result.status === 'lab_nitrogen_evidence_present';

  return {
    id: `satellite:${result.fieldId}:nutrient-differential:${
      result.trigger.observedAt?.slice(0, 10) || 'current'
    }`,
    group: 'satellite-differential',
    source: 'satellite',
    sourceModel: 'ndvi-differential-safety-filter-v14.1',
    signal: {
      status: needsEvidence ? 'needs-data' : 'ready',
      observedAt: result.trigger.observedAt,
      maxAgeHours: 30 * 24,
    },
    confidence: labNitrogen ? 'medium' : hasAlternatives ? 'medium' : 'preliminary',
    kind: 'check',
    priority: labNitrogen ? 94 : hasAlternatives ? 93 : 91,
    severity: 'warning',
    target: 'map_vegetation',
    channels: ['today', 'notification', 'pusula'],
    label: 'NEDENİ DOĞRULA',
    title: result.headline,
    detail: `${result.summary} ${result.action}`.trim(),
    evidence: result.evidence,
    task: fieldControlTask(result),
    today: {
      tone: 'amber',
      visual: 'spraying',
      iconKey: 'leaf-green',
      iconClass: 'leaf',
    },
    notification: {
      iconKey: 'leaf',
      iconTone: 'green',
      dotTone: 'warning',
    },
  };
}
