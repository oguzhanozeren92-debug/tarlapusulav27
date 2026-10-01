import type { HomeDecisionEvent } from '../../decision/types/homeDecision';
import type { IrrigationDistributionSnapshot } from '../types/irrigationDistribution';

export function buildIrrigationDistributionDecision(
  snapshot: IrrigationDistributionSnapshot | null,
): HomeDecisionEvent | null {
  if (!snapshot || (snapshot.status !== 'suspect' && snapshot.status !== 'recurrent')) return null;
  const area = snapshot.area ?? 'tarla geneli';
  const recurrent = snapshot.status === 'recurrent';
  const period = snapshot.satelliteDate ?? snapshot.generatedAt.slice(0, 10);
  return {
    id: `irrigation-distribution:${snapshot.fieldId}:${period}:${area}`,
    group: 'irrigation-distribution',
    source: 'irrigation-distribution',
    sourceModel: 'irrigation-distribution-engine-v22',
    priority: recurrent ? 95 : 84,
    severity: 'warning',
    target: 'map_vegetation',
    channels: ['today', 'notification', 'pusula'],
    kind: 'check',
    label: recurrent ? 'TEKRARLAYAN SULAMA DESENİ' : 'SULAMA DAĞILIMI',
    title: snapshot.headline,
    detail: snapshot.summary,
    evidence: [
      ...snapshot.evidence.slice(0, 4),
      `Farklı sulamalarda aynı bölge tekrar sayısı: ${snapshot.repeatCount}.`,
      'Bu sonuç arıza teşhisi değildir; işaretli bölge ve sulama hattı sahada kontrol edilmelidir.',
    ],
    confidence: snapshot.confidence === 'strong' ? 'strong' : snapshot.confidence === 'medium' ? 'medium' : 'preliminary',
    signal: {
      status: 'ready',
      observedAt: snapshot.satelliteDate,
      maxAgeHours: 24 * 21,
    },
    task: {
      taskKey: `irrigation-distribution-check:${snapshot.fieldId}:${period}:${area}`,
      actionTarget: 'map_vegetation',
      rewardPoints: 0,
      rewardRuleKey: null,
      metadata: {
        source: 'irrigation_distribution',
        direction: area,
        importantArea: { area, geometry: null },
        irrigationDate: snapshot.latestIrrigation?.date ?? null,
        satelliteDate: snapshot.satelliteDate,
        repeatCount: snapshot.repeatCount,
        anomalyScore: snapshot.anomalyScore,
      },
    },
    today: {
      tone: recurrent ? 'red' : 'gold',
      visual: 'irrigation',
      iconKey: 'water',
      iconClass: 'water',
    },
    notification: {
      iconKey: 'rain',
      iconTone: 'cyan',
      dotTone: 'warning',
    },
  };
}
