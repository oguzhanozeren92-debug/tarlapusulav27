import type { HomeDecisionEvent } from '../../decision/types/homeDecision';
import type { FieldYieldHarvestQualityLiveSnapshot } from '../types/fieldYieldHarvestQuality';
import { formatHarvestQualityMeasurements } from './harvestQualityLabel.service';

function formatDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(`${String(value).slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(parsed);
}

function kgDa(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  const kgHa = Number(value);
  return Number.isFinite(kgHa) ? `${Math.round(kgHa / 10).toLocaleString('tr-TR')} kg/da` : null;
}

function modelRange(live: FieldYieldHarvestQualityLiveSnapshot) {
  const f = live.snapshot.ensemble?.forecast;
  if (!f || f.status !== 'model_supported') return null;
  const lower = kgDa(f.lowerKgHa);
  const upper = kgDa(f.upperKgHa);
  const central = kgDa(f.centralKgHa);
  if (lower && upper && lower !== upper) return `${lower}–${upper}`;
  return central;
}

export function buildYieldHarvestDecision(
  live: FieldYieldHarvestQualityLiveSnapshot | null | undefined,
): HomeDecisionEvent | null {
  if (!live?.fieldId) return null;
  const s = live.snapshot;
  const timing = s.ensemble?.harvestTiming ?? null;
  const supportModels = (s.ensemble?.members ?? [])
    .filter((member) => member.status === 'ready' || member.status === 'context')
    .map((member) => member.key === 'dssat' ? 'dssat-shadow' : member.key)
    .filter((key) => !['yield4cast', 'qualitree'].includes(key));
  const sourceModel = [`yield-harvest-engine-v${s.engineVersion}`, ...supportModels].join(';');
  const evidence = [
    s.observed.yieldKgHa != null ? `Gerçek verim: ${kgDa(s.observed.yieldKgHa)}.` : null,
    modelRange(live) ? `Buğday verim kanıt zarfı: ${modelRange(live)}; istatistiksel güven aralığı değildir.` : null,
    timing?.note ?? null,
    s.quality.status === 'measured'
      ? `Gerçek kalite ölçümü: ${formatHarvestQualityMeasurements(s.quality.measurements).join(' · ')}.`
      : 'Kalite ölçümü yok; kalite puanı üretilmedi.',
    'Gerçek hasat/verim kaydı destek modellerinin üstündedir.',
  ].filter((item): item is string => Boolean(item)).slice(0, 7);

  if (s.status === 'harvest_window') {
    const day = timing?.date ?? s.harvest.expectedDate;
    const days = Number(s.harvest.daysToExpectedHarvest);
    return {
      id: `yield-harvest:${live.fieldId}:window:${day ?? 'active'}`,
      group: 'yield-harvest', source: 'yield-harvest', sourceModel,
      priority: 86, severity: 'warning', target: 'calendar',
      channels: ['today', 'notification', 'pusula'], label: 'HASAT',
      title: 'Hasat Penceresini Kontrol Et',
      detail: Number.isFinite(days) && days > 0
        ? `Hasada yaklaşık ${Math.round(days)} gün kaldı${day ? ` · ${formatDate(day)}` : ''}. Olgunluğu sahada doğrula.`
        : `${day ? `${formatDate(day)} çevresinde ` : ''}hasat penceresi aktif. Olgunluğu sahada doğrula.`,
      evidence, confidence: timing?.confidence === 'high' ? 'strong' : timing?.confidence === 'medium' ? 'medium' : 'preliminary', kind: 'upcoming',
      today: { tone: 'amber', visual: 'spraying', iconKey: 'leaf-gold', iconClass: 'leaf' },
      notification: { iconKey: 'leaf', iconTone: 'gold', dotTone: 'warning' },
    };
  }

  const days = Number(s.harvest.daysToExpectedHarvest);
  if (s.status === 'pre_harvest' && Number.isFinite(days) && days >= 0 && days <= 14) {
    return {
      id: `yield-harvest:${live.fieldId}:approaching:${Math.round(days)}`,
      group: 'yield-harvest', source: 'yield-harvest', sourceModel,
      priority: 72, severity: 'info', target: 'calendar',
      channels: ['today', 'pusula'], label: 'HASAT',
      title: `Hasada Yaklaşık ${Math.round(days)} Gün`,
      detail: timing?.date ? `Hedef tarih ${formatDate(timing.date)}; saha olgunluğu son karardır.` : 'Hasat takibini sıklaştır.',
      evidence, confidence: 'medium', kind: 'upcoming',
      today: { tone: 'neutral', visual: 'spraying', iconKey: 'leaf-green', iconClass: 'leaf' },
    };
  }

  if (s.status === 'harvested' && s.quality.status === 'not_measured') {
    return {
      id: `yield-harvest:${live.fieldId}:quality-missing:${s.harvest.actualDate ?? 'harvested'}`,
      group: 'yield-harvest-quality', source: 'yield-harvest', sourceModel,
      priority: 45, severity: 'info', target: 'field_growth',
      channels: ['notification', 'pusula'], label: 'HASAT KALİTESİ',
      title: 'Kalite Ölçümünü Ekle',
      detail: 'Hasat kaydı var; protein/nem/hektolitre veya bahçe ürünü kalite ölçümünü eklersen Pusula gerçek kaliteyi rapora bağlar.',
      evidence, confidence: 'strong', kind: 'data',
      notification: { iconKey: 'document', iconTone: 'green', dotTone: 'info' },
    };
  }

  return null;
}
