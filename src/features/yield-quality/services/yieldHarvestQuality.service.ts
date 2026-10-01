import type {
  YieldHarvestQualityInput,
  YieldHarvestQualitySnapshot,
  YieldHistoryPoint,
} from '../types/yieldHarvestQuality';

const finite = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const round = (value: number | null, digits = 1) => {
  if (value === null) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const dateOnly = (value?: string | null) => {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const parsed = new Date(text.length === 10 ? `${text}T12:00:00Z` : text);
  return Number.isNaN(parsed.getTime()) ? null : text.slice(0, 10);
};

const daysBetween = (from: Date, toDate?: string | null) => {
  const normalized = dateOnly(toDate);
  if (!normalized) return null;
  const to = new Date(`${normalized}T12:00:00Z`);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
};

const usableHistory = (history: YieldHistoryPoint[] | undefined, currentYear: number) =>
  (history ?? [])
    .map((item) => ({ ...item, yieldKg: finite(item.yieldKg) }))
    .filter((item) => item.yieldKg !== null && item.yieldKg >= 0 && Number.isInteger(item.year))
    .filter((item) => item.year <= currentYear)
    .sort((a, b) => a.year - b.year);

function trendOf(rows: Array<YieldHistoryPoint & { yieldKg: number }>) {
  if (rows.length < 3) return 'insufficient' as const;
  const last = rows.slice(-3).map((row) => row.yieldKg);
  const first = last[0];
  const end = last[last.length - 1];
  if (first <= 0) return 'insufficient' as const;
  const change = (end - first) / first;
  if (change >= 0.1) return 'rising' as const;
  if (change <= -0.1) return 'falling' as const;
  return 'stable' as const;
}

function harvestStatus(input: YieldHarvestQualityInput, today: Date) {
  const stage = String(input.currentStage ?? '').toLocaleLowerCase('tr-TR');
  if (dateOnly(input.actualHarvestDate) || /post[_ -]?harvest|hasat sonrası|hasat sonrasi/.test(stage)) {
    return 'harvested' as const;
  }
  if (/harvest[_ -]?window|hasat penceresi|hasat/.test(stage)) {
    return 'harvest_window' as const;
  }
  const days = daysBetween(today, input.expectedHarvestDate);
  if (days !== null && days >= -7 && days <= 21) return 'harvest_window' as const;
  if (input.expectedHarvestDate || input.currentStage) return 'pre_harvest' as const;
  return 'needs_data' as const;
}

export function buildYieldHarvestQualitySnapshot(
  input: YieldHarvestQualityInput,
  now = new Date(),
): YieldHarvestQualitySnapshot {
  const currentYear = Number.isInteger(input.currentYear) ? Number(input.currentYear) : now.getUTCFullYear();
  const areaHa = finite(input.areaHa);
  const currentYieldKg = finite(input.currentYieldKg);
  const history = usableHistory(input.history, currentYear) as Array<YieldHistoryPoint & { yieldKg: number }>;
  const historyYields = history.map((item) => item.yieldKg);
  const averageYieldKg = historyYields.length
    ? historyYields.reduce((sum, value) => sum + value, 0) / historyYields.length
    : null;

  const normalizedQuality = Object.fromEntries(
    Object.entries(input.qualityMeasurements ?? {})
      .map(([key, value]) => [key, value === undefined ? null : value])
      .filter(([, value]) => value !== null && String(value).trim() !== ''),
  ) as Record<string, number | string | null>;

  const actualHarvestDate = dateOnly(input.actualHarvestDate);
  const expectedHarvestDate = dateOnly(input.expectedHarvestDate);
  const status = harvestStatus(input, now);
  const notes: string[] = [];

  if (input.cropCycle === 'perennial' && input.bearing === false) {
    notes.push('Parsel ürün vermiyor olarak işaretli; verim/hasat tahmini üretilmedi.');
  }
  if (currentYieldKg !== null) {
    notes.push('Gerçek kullanıcı hasat/verim kaydı model tahminlerinden daha güçlü kanıt kabul edildi.');
  } else if (history.length) {
    notes.push('Güncel gerçek verim kaydı yok; yalnız geçmiş üretim geçmişi bağlam olarak kullanıldı.');
  } else {
    notes.push('Verim geçmişi bulunamadı; model çıktısı gerçek verimmiş gibi gösterilmedi.');
  }
  if (!Object.keys(normalizedQuality).length) {
    notes.push('Kalite ölçümü girilmediği için kalite sınıfı veya kalite skoru üretilmedi.');
  }

  const dataSignals = [
    currentYieldKg !== null,
    history.length > 0,
    Boolean(expectedHarvestDate || actualHarvestDate || input.currentStage),
  ].filter(Boolean).length;

  return {
    engine: 'yield-harvest-engine',
    engineVersion: '15.0',
    fieldId: String(input.fieldId),
    crop: String(input.crop || 'Ürün belirtilmedi'),
    status,
    generatedAt: now.toISOString(),
    observed: {
      yieldKg: round(currentYieldKg),
      yieldKgHa: areaHa && areaHa > 0 && currentYieldKg !== null
        ? round(currentYieldKg / areaHa)
        : null,
      harvestDate: actualHarvestDate,
    },
    history: {
      sampleCount: history.length,
      averageYieldKg: round(averageYieldKg),
      averageYieldKgHa: areaHa && areaHa > 0 && averageYieldKg !== null
        ? round(averageYieldKg / areaHa)
        : null,
      minYieldKg: historyYields.length ? round(Math.min(...historyYields)) : null,
      maxYieldKg: historyYields.length ? round(Math.max(...historyYields)) : null,
      trend: trendOf(history),
    },
    harvest: {
      expectedDate: expectedHarvestDate,
      actualDate: actualHarvestDate,
      daysToExpectedHarvest: status === 'harvested' ? null : daysBetween(now, expectedHarvestDate),
      stage: String(input.currentStage ?? '').trim() || null,
    },
    quality: {
      status: Object.keys(normalizedQuality).length ? 'measured' : 'not_measured',
      measurements: normalizedQuality,
      note: Object.keys(normalizedQuality).length
        ? 'Kalite alanları kullanıcı/laboratuvar ölçümü olarak saklandı; model bu değerleri uydurmaz.'
        : 'Kalite için gerçek ölçüm gerekli. Uydu indeksi tek başına ürün kalite notu değildir.',
    },
    authority: {
      scope: 'yield.harvest_quality',
      productionAuthority: true,
      supportingModels: ['dssat', 'aquacrop', 'pcse-wofost', 'sl2p-biophysics', 'yield4cast', 'qualitree'],
    },
    dataQuality: dataSignals >= 3 ? 'good' : dataSignals >= 1 ? 'partial' : 'insufficient',
    notes,
  };
}
