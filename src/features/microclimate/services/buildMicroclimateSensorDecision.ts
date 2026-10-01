import type { HomeDecisionEvent } from '../../decision/types/homeDecision';
import type { MicroclimateSensorSnapshot } from '../types/microclimateSensor';

export function buildMicroclimateSensorDecision(
  snapshot: MicroclimateSensorSnapshot | null | undefined,
): HomeDecisionEvent | null {
  if (!snapshot || snapshot.status === 'no_devices' || snapshot.status === 'waiting') return null;

  const observedAt = snapshot.latestObservedAt ?? snapshot.generatedAt;
  const latest = snapshot.latest;
  const measuredCold = latest?.airTemperatureC != null && latest.airTemperatureC <= 1;
  const measuredHeat = latest?.airTemperatureC != null && latest.airTemperatureC >= 38;

  if (snapshot.rangeAlerts.length) {
    return {
      id: `microclimate:${snapshot.fieldId}:hydraulic:${observedAt}`,
      group: 'microclimate-sensor',
      source: 'microclimate-sensor',
      sourceModel: 'microclimate-sensor-v24',
      signal: { status: 'ready', observedAt, maxAgeHours: 1 },
      priority: 88,
      severity: 'warning',
      target: 'irrigation_detail',
      channels: ['today', 'notification', 'pusula'],
      kind: 'check',
      label: 'CANLI SENSÖR',
      title: 'Debi / basınç değerini kontrol et',
      detail: snapshot.summary,
      evidence: snapshot.evidence,
      confidence: snapshot.confidence === 'strong' ? 'strong' : 'medium',
      today: { tone: 'amber', visual: 'irrigation', iconKey: 'water', iconClass: 'water' },
      notification: { iconKey: 'rain', iconTone: 'cyan', dotTone: 'warning' },
    };
  }

  if (measuredCold || measuredHeat) {
    return {
      id: `microclimate:${snapshot.fieldId}:temperature:${observedAt}`,
      group: 'microclimate-sensor',
      source: 'microclimate-sensor',
      sourceModel: 'microclimate-sensor-v24',
      signal: { status: 'ready', observedAt, maxAgeHours: 1 },
      priority: measuredCold ? 89 : 83,
      severity: 'warning',
      target: 'weather',
      channels: ['today', 'notification', 'pusula'],
      kind: 'check',
      label: 'SAHA MİKROİKLİMİ',
      title: measuredCold ? 'Saha sensöründe çok düşük sıcaklık ölçüldü' : 'Saha sensöründe yüksek sıcaklık ölçüldü',
      detail: `${latest?.airTemperatureC?.toFixed(1)} °C gerçek saha ölçümü alındı. Bu tek ölçüm zarar teşhisi değildir; hava tahmini ve tarla bağlamıyla birlikte kontrol et.`,
      evidence: snapshot.evidence,
      confidence: snapshot.confidence === 'strong' ? 'strong' : 'medium',
      today: { tone: 'amber', visual: 'spraying', iconKey: 'rain', iconClass: 'leaf' },
      notification: { iconKey: 'rain', iconTone: 'cyan', dotTone: 'warning' },
    };
  }

  return null;
}
