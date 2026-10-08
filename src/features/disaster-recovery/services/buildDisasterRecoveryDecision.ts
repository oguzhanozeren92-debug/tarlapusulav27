import type { HomeDecisionEvent } from '../../decision/types/homeDecision';
import type { DisasterRecoveryResult } from './disasterRecovery.service';

function confidence(value: DisasterRecoveryResult['confidence']) {
  if (value === 'high') return 'strong' as const;
  if (value === 'medium') return 'medium' as const;
  return 'preliminary' as const;
}

function signalObservedAt(result: DisasterRecoveryResult) {
  return result.event?.date
    ? `${result.event.date}T12:00:00.000Z`
    : result.generatedAt;
}

export function buildDisasterRecoveryDecision(
  result: DisasterRecoveryResult | null | undefined,
): HomeDecisionEvent | null {
  if (!result?.fieldId) return null;

  const common = {
    group: 'disaster-recovery',
    source: 'disaster-recovery' as const,
    sourceModel: 'disaster-recovery-v27',
    target: 'map_vegetation' as const,
    label: 'TARLADA NE OLDU?',
    evidence: [
      ...result.evidence.slice(0, 7),
      result.caution,
    ].filter(Boolean),
    confidence: confidence(result.confidence),
    signal: {
      status: 'ready' as const,
      observedAt: signalObservedAt(result),
      maxAgeHours: 24 * 30,
    },
  };

  if (result.status === 'damage_signal_supported') {
    const severeDrop = (result.damage.ndviDropPercent ?? 0) >= 25;
    return {
      id: `disaster-recovery:${result.fieldId}:${result.event?.date ?? result.generatedAt.slice(0, 10)}:damage`,
      ...common,
      priority: severeDrop ? 111 : 104,
      severity: severeDrop ? 'danger' : 'warning',
      channels: ['today', 'notification', 'pusula'],
      kind: 'check',
      title: result.headline,
      detail: `${result.summary} ${result.action}`.trim(),
      task: {
        taskKey: `disaster-recovery-field-check:${result.fieldId}:${result.event?.date ?? result.generatedAt.slice(0, 10)}`,
        actionTarget: 'field-photo',
        rewardPoints: 0,
        rewardRuleKey: null,
        metadata: {
          source: 'disaster_recovery',
          requestPhoto: true,
          eventType: result.event?.type ?? null,
          eventDate: result.event?.date ?? null,
          ndviDropPercent: result.damage.ndviDropPercent,
          recoveryPercent: result.recovery.percentOfPreEvent,
        },
      },
      today: {
        tone: severeDrop ? 'red' : 'gold',
        visual: 'spraying',
        iconKey: 'leaf-gold',
        iconClass: 'leaf',
      },
      notification: {
        iconKey: 'leaf',
        iconTone: 'gold',
        dotTone: severeDrop ? 'danger' : 'warning',
      },
    };
  }

  if (result.status === 'recovering') {
    return {
      id: `disaster-recovery:${result.fieldId}:${result.event?.date ?? result.generatedAt.slice(0, 10)}:recovering`,
      ...common,
      priority: 72,
      severity: 'info',
      channels: ['today', 'pusula'],
      kind: 'check',
      title: result.headline,
      detail: `${result.summary} ${result.action}`.trim(),
      today: {
        tone: 'green',
        visual: 'spraying',
        iconKey: 'leaf-green',
        iconClass: 'leaf',
      },
    };
  }

  if (result.status === 'recovered') {
    return {
      id: `disaster-recovery:${result.fieldId}:${result.event?.date ?? result.generatedAt.slice(0, 10)}:recovered`,
      ...common,
      priority: 38,
      severity: 'info',
      channels: ['pusula'],
      kind: 'data',
      title: result.headline,
      detail: result.summary,
    };
  }

  if (result.status === 'event_detected_waiting_satellite') {
    return {
      id: `disaster-recovery:${result.fieldId}:${result.event?.date ?? result.generatedAt.slice(0, 10)}:waiting`,
      ...common,
      priority: 50,
      severity: 'info',
      channels: ['pusula'],
      kind: 'data',
      title: result.headline,
      detail: result.summary,
    };
  }

  return null;
}
