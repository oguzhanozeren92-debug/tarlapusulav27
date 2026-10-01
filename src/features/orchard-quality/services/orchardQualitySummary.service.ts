import type { FieldYieldHarvestQualityLiveSnapshot } from '../../yield-quality/types/fieldYieldHarvestQuality';
import type { OrchardQualityMetric, OrchardQualitySummary } from '../types/orchardQuality';

const LABELS: Record<string, { label: string; unit: string; explanation: string }> = {
  brix: {
    label: 'Şeker / çözünür kuru madde',
    unit: '°Bx',
    explanation: 'Olgunluk ve tat takibinde kullanılan saha/laboratuvar ölçümüdür.',
  },
  fruit_size_mm: {
    label: 'Meyve iriliği',
    unit: 'mm',
    explanation: 'Boylama ve satış sınıflaması konuşulurken kullanılabilecek gerçek ölçümdür.',
  },
  fruit_weight_g: {
    label: 'Ortalama meyve ağırlığı',
    unit: 'g',
    explanation: 'Örneklenen meyvenin ağırlık bilgisidir; tek başına toplam verimi belirlemez.',
  },
  moisture_pct: {
    label: 'Ürün nemi',
    unit: '%',
    explanation: 'Özellikle kurutma/depolama planında önemli olabilecek gerçek ölçümdür.',
  },
};

function text(value: unknown) {
  return String(value ?? '').trim();
}

function formatValue(value: unknown, unit: string) {
  const number = Number(value);
  if (Number.isFinite(number)) {
    return `${number.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ''}`;
  }
  const raw = text(value);
  return raw || '—';
}

function fruitMetrics(measurements: Record<string, unknown>) {
  const preferred = ['brix', 'fruit_size_mm', 'fruit_weight_g', 'moisture_pct'];
  const metrics: OrchardQualityMetric[] = [];

  for (const key of preferred) {
    const value = measurements[key];
    if (value === null || value === undefined || text(value) === '') continue;
    const meta = LABELS[key];
    metrics.push({
      key,
      label: meta.label,
      value: formatValue(value, meta.unit),
      explanation: meta.explanation,
    });
  }

  return metrics;
}

export function buildOrchardQualitySummary(
  live: FieldYieldHarvestQualityLiveSnapshot | null | undefined,
): OrchardQualitySummary {
  if (!live?.snapshot) {
    return {
      status: 'unavailable',
      headline: 'Kalite verisi henüz yüklenmedi',
      meaning: 'Hasat ve kalite kayıtları geldiğinde burada aynı kaynaktan özetlenecek.',
      measuredAt: null,
      harvestDate: null,
      metrics: [],
      evidence: [],
      warnings: [],
    };
  }

  const snapshot = live.snapshot;
  const quality = snapshot.quality;
  const metrics = fruitMetrics(quality.measurements ?? {});
  const harvestDate = snapshot.observed.harvestDate ?? snapshot.harvest.actualDate ?? null;

  if (quality.status !== 'measured' || !metrics.length) {
    return {
      status: 'not_measured',
      headline: 'Meyve kalitesi için gerçek ölçüm yok',
      meaning: 'Hasat/örnekleme sırasında Brix, meyve iriliği, meyve ağırlığı veya ürün nemi girildiğinde Pusula bunları satış, rapor ve kalite geçmişinde kullanır.',
      measuredAt: null,
      harvestDate,
      metrics: [],
      evidence: [
        snapshot.observed.yieldKg != null
          ? `Gerçek hasat miktarı kayıtlı: ${snapshot.observed.yieldKg.toLocaleString('tr-TR')} kg.`
          : 'Gerçek hasat miktarı henüz kayıtlı değil.',
        harvestDate ? `Hasat tarihi: ${harvestDate}.` : 'Gerçek hasat tarihi henüz kayıtlı değil.',
      ],
      warnings: [
        'Çeşit/pazar standardı doğrulanmadan kalite sınıfı veya iyi-kötü eşiği üretmiyorum.',
      ],
    };
  }

  return {
    status: 'measured',
    headline: `${metrics.length} gerçek kalite ölçümü kayıtlı`,
    meaning: 'Bu değerler tahmin değil; kayıtlı ölçümlerdir. Satış görüşmesi, hasat raporu ve gelecek yıl karşılaştırması için aynı kalite geçmişinde tutulur.',
    measuredAt: live.sources.qualityMeasurementLoaded ? live.generatedAt : null,
    harvestDate,
    metrics,
    evidence: [
      snapshot.observed.yieldKg != null
        ? `Gerçek hasat miktarı: ${snapshot.observed.yieldKg.toLocaleString('tr-TR')} kg.`
        : null,
      harvestDate ? `Hasat tarihi: ${harvestDate}.` : null,
      'Kalite ölçümü, verim/hasat motorunun gerçek ölçüm katmanından gelir.',
    ].filter((item): item is string => Boolean(item)),
    warnings: [
      'Ölçülen değerleri çeşit/pazar standardı olmadan otomatik kalite sınıfına çevirmiyorum.',
    ],
  };
}
