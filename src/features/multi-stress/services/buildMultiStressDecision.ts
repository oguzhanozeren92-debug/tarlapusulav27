import type { HomeDecisionEvent } from '../../decision/types/homeDecision';
import type { MultiStressSynthesis } from '../types/multiStress';

function dayKey(value: string) {
  return String(value ?? '').slice(0, 10) || 'current';
}

export function buildMultiStressDecision(
  synthesis: MultiStressSynthesis | null | undefined,
): HomeDecisionEvent | null {
  if (!synthesis || synthesis.status === 'none' || synthesis.signals.length < 2) return null;

  const conflicted = synthesis.status === 'conflicted';
  const danger = synthesis.signals.some((item) => item.level === 'danger');
  const needsFieldCheck = conflicted || !synthesis.dominantFamily || synthesis.confidence === 'preliminary';

  return {
    id: `multi-stress:${synthesis.fieldId}:${dayKey(synthesis.observedAt ?? synthesis.generatedAt)}:${synthesis.status}`,
    group: 'multi-stress-synthesis',
    source: 'multi-stress',
    sourceModel: 'multi-stress-synthesis-v26',
    signal: {
      status: synthesis.confidence === 'preliminary' ? 'partial' : 'ready',
      observedAt: synthesis.observedAt ?? synthesis.generatedAt,
      maxAgeHours: 48,
    },
    priority: conflicted ? 112 : danger ? 108 : 101,
    severity: danger || conflicted ? 'danger' : 'warning',
    target: 'ai',
    channels: ['today', 'notification', 'pusula'],
    kind: 'check',
    label: 'BİRLEŞİK STRES',
    title: synthesis.headline,
    detail: `${synthesis.summary} ${synthesis.action}`.trim(),
    evidence: [
      ...synthesis.evidence.slice(0, 9),
      ...synthesis.warnings.slice(0, 3),
    ],
    confidence: synthesis.confidence,
    task: needsFieldCheck
      ? {
          taskKey: `multi-stress-field-check:${synthesis.fieldId}:${dayKey(synthesis.generatedAt)}`,
          actionTarget: 'field-photo',
          rewardPoints: 0,
          rewardRuleKey: null,
          metadata: {
            source: 'multi_stress_synthesis',
            version: synthesis.version,
            requestPhoto: true,
            status: synthesis.status,
            dominantFamily: synthesis.dominantFamily,
            stressFamilies: synthesis.signals.map((item) => item.family),
            guidance: 'Aynı bölgeden genel bitki görünümü, yakın plan belirti ve toprak/yüzey koşulunu birlikte kaydet.',
          },
        }
      : undefined,
    today: {
      tone: danger || conflicted ? 'red' : 'amber',
      visual: 'spraying',
      iconKey: 'leaf-gold',
      iconClass: 'leaf',
    },
    notification: {
      iconKey: 'leaf',
      iconTone: 'gold',
      dotTone: danger || conflicted ? 'danger' : 'warning',
    },
  };
}
