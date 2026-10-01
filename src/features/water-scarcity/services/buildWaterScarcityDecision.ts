import type { HomeDecisionEvent } from '../../decision/types/homeDecision';
import type { WaterScarcityPlanSnapshot } from '../types/waterScarcity';

export function buildWaterScarcityDecision(
  snapshot: WaterScarcityPlanSnapshot | null,
): HomeDecisionEvent | null {
  if (!snapshot) return null;
  if (!['controlled_reduce', 'protect_water', 'scarcity_plan'].includes(snapshot.state)) return null;

  const scarcity = snapshot.state === 'scarcity_plan';
  const protect = snapshot.state === 'protect_water';
  const coverage = snapshot.irrigation.physicalCoverageRatio;

  return {
    id: `water-scarcity:${snapshot.fieldId}:${snapshot.generatedAt.slice(0, 10)}:${snapshot.state}`,
    group: 'water-scarcity',
    source: 'water-scarcity',
    sourceModel: 'water-scarcity-plan-engine-v23',
    priority: scarcity ? 98 : protect ? 92 : 87,
    severity: scarcity ? 'danger' : 'warning',
    target: 'irrigation_detail',
    channels: ['today', 'notification', 'pusula'],
    kind: 'do',
    label: scarcity ? 'SU KITLIĞI PLANI' : protect ? 'SUYU KORU' : 'KONTROLLÜ AZALT',
    title: snapshot.headline,
    detail: snapshot.action,
    evidence: [
      ...snapshot.evidence.slice(0, 5),
      coverage !== null
        ? `Fiziksel su karşılama oranı: yaklaşık %${Math.round(coverage * 100)}.`
        : 'Fiziksel karşılama oranı hesaplanamadı.',
      'Bu sonuç optimum eksik sulama yüzdesi veya verim kaybı tahmini değildir.',
    ],
    confidence: snapshot.confidence === 'high'
      ? 'strong'
      : snapshot.confidence === 'medium'
        ? 'medium'
        : 'preliminary',
    signal: {
      status: 'ready',
      observedAt: snapshot.generatedAt,
      maxAgeHours: 24,
    },
    today: {
      tone: scarcity ? 'red' : 'gold',
      visual: 'irrigation',
      iconKey: 'water',
      iconClass: 'water',
    },
    notification: {
      iconKey: 'rain',
      iconTone: scarcity ? 'gold' : 'cyan',
      dotTone: scarcity ? 'danger' : 'warning',
    },
  };
}
