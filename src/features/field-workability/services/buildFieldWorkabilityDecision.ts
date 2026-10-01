import type { HomeDecisionEvent } from '../../decision/types/homeDecision';
import type { FieldWorkabilitySnapshot } from '../types/fieldWorkability';

export function buildFieldWorkabilityDecision(
  snapshot: FieldWorkabilitySnapshot | null | undefined,
): HomeDecisionEvent | null {
  if (!snapshot?.fieldId) return null;

  const common = {
    group: 'field-workability',
    source: 'field-workability' as const,
    target: 'soil' as const,
    label: 'TARLAYA GİRİŞ',
    sourceModel: 'field-workability-engine-v21',
    evidence: snapshot.evidence.slice(0, 6),
    confidence: snapshot.confidence,
    today: {
      visual: 'spraying' as const,
      iconKey: 'rain' as const,
      iconClass: 'water' as const,
      tone: snapshot.status === 'suitable'
        ? 'green'
        : snapshot.status === 'wait'
          ? 'red'
          : snapshot.status === 'caution'
            ? 'amber'
            : 'neutral',
    },
  };

  if (snapshot.status === 'wait') {
    return {
      id: `field-workability:${snapshot.fieldId}:wait:${snapshot.generatedAt.slice(0, 10)}`,
      ...common,
      priority: 94,
      severity: 'warning',
      channels: ['today', 'notification', 'pusula'],
      kind: 'avoid',
      title: snapshot.headline,
      detail: snapshot.summary,
      notification: {
        iconKey: 'rain',
        iconTone: 'cyan',
        dotTone: 'warning',
      },
    };
  }

  if (snapshot.status === 'caution') {
    return {
      id: `field-workability:${snapshot.fieldId}:caution:${snapshot.generatedAt.slice(0, 10)}`,
      ...common,
      priority: 76,
      severity: 'warning',
      channels: ['today', 'pusula'],
      kind: 'check',
      title: snapshot.headline,
      detail: snapshot.summary,
    };
  }

  if (snapshot.status === 'suitable') {
    return {
      id: `field-workability:${snapshot.fieldId}:suitable:${snapshot.generatedAt.slice(0, 10)}`,
      ...common,
      priority: 57,
      severity: 'info',
      channels: ['today'],
      kind: 'do',
      title: snapshot.headline,
      detail: snapshot.summary,
    };
  }

  return {
    id: `field-workability:${snapshot.fieldId}:needs-data:${snapshot.generatedAt.slice(0, 10)}`,
    ...common,
    priority: 60,
    severity: 'info',
    channels: ['today'],
    kind: 'data',
    title: snapshot.headline,
    detail: snapshot.summary,
  };
}
