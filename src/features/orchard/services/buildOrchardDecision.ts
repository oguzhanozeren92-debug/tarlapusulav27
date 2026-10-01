import type { HomeDecisionEvent } from '../../decision/types/homeDecision';
import type { OrchardIntelligenceSnapshot } from '../types/orchardTree';

export function buildOrchardDecision(
  snapshot: OrchardIntelligenceSnapshot | null | undefined,
): HomeDecisionEvent | null {
  if (!snapshot?.pilotEnabled || !snapshot.fieldId) return null;

  if (snapshot.treeCount === 0) {
    return {
      id: `orchard:${snapshot.fieldId}:tree-layer-empty`,
      group: 'orchard-tree',
      source: 'orchard-tree',
      sourceModel: 'orchard-tree-engine-v16',
      priority: 34,
      severity: 'info',
      target: 'field_growth',
      channels: ['notification'],
      label: 'AĞAÇ KATMANI',
      title: 'Bahçedeki Ağaçları Kaydet',
      detail: 'Badem/fıstık pilotunda ağaçları ayrı varlık olarak eklediğinde çiçek, meyve, su ve stres gözlemleri ağaca bağlanır.',
      evidence: ['Ağaç katmanı opsiyoneldir; kayıt olmayan ağaç otomatik varmış gibi oluşturulmaz.'],
      confidence: 'strong',
      kind: 'data',
      signal: { status: 'needs-data' },
      notification: { iconKey: 'leaf', iconTone: 'green', dotTone: 'info' },
    };
  }

  if (snapshot.highStressTreeCount > 0 || snapshot.waterStressTreeCount > 0) {
    const count = new Set([
      ...snapshot.latestObservations.filter((item) => item.stressLevel === 'high').map((item) => item.treeId),
      ...snapshot.latestObservations.filter((item) => item.waterStatus === 'stress').map((item) => item.treeId),
    ]).size;
    return {
      id: `orchard:${snapshot.fieldId}:attention:${snapshot.latestObservationAt ?? 'current'}`,
      group: 'orchard-tree',
      source: 'orchard-tree',
      sourceModel: 'orchard-tree-engine-v16',
      priority: 74,
      severity: 'warning',
      target: 'field_growth',
      channels: ['today', 'notification', 'pusula'],
      label: 'BAHÇE',
      title: `${Math.max(1, count)} Ağaç Öncelikli Kontrol İstiyor`,
      detail: 'Gerçek ağaç gözlemlerinde yüksek stres veya su stresi kaydı var. Önce bu ağaçları ve yakın komşularını sahada karşılaştır.',
      evidence: snapshot.evidence.slice(0, 6),
      confidence: 'strong',
      kind: 'check',
      signal: { status: 'ready', observedAt: snapshot.latestObservationAt, maxAgeHours: 720 },
      today: { tone: 'amber', visual: 'spraying', iconKey: 'leaf-gold', iconClass: 'leaf' },
      notification: { iconKey: 'leaf', iconTone: 'gold', dotTone: 'warning' },
    };
  }

  if (snapshot.alternance.status === 'possible') {
    return {
      id: `orchard:${snapshot.fieldId}:alternance:${snapshot.generatedAt.slice(0, 10)}`,
      group: 'orchard-tree',
      source: 'orchard-tree',
      sourceModel: 'orchard-tree-engine-v16',
      priority: 58,
      severity: 'info',
      target: 'field_growth',
      channels: ['notification', 'pusula'],
      label: 'BAHÇE',
      title: 'Olası Alternans Örüntüsü Var',
      detail: `${snapshot.alternance.possibleTreeIds.length} ağaçta son üç gerçek ağaç-verim kaydı dönüşümlü yük örüntüsü gösteriyor; bu teşhis değil, saha/çiçeklenme takibi için sinyaldir.`,
      evidence: snapshot.alternance.evidence,
      confidence: 'medium',
      kind: 'check',
      signal: { status: 'ready', observedAt: snapshot.latestObservationAt, maxAgeHours: 24 * 365 },
      notification: { iconKey: 'leaf', iconTone: 'green', dotTone: 'info' },
    };
  }

  return null;
}
