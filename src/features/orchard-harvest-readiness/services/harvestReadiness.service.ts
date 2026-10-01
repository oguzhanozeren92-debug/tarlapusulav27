import type { WeatherForecastDay } from '../../../types';
import type { HarvestReadinessInput, HarvestReadinessSnapshot, HarvestWorkDay } from '../types/harvestReadiness';

function text(value: unknown) {
  return String(value ?? '').trim();
}

function normalize(value: unknown) {
  return text(value).toLocaleLowerCase('tr-TR').replace(/[_-]+/g, ' ');
}

function finite(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function dateOnly(value: unknown) {
  const raw = text(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function daysBetween(now: Date, date: string | null) {
  if (!date) return null;
  const target = new Date(`${date}T12:00:00Z`);
  const source = new Date(now);
  source.setUTCHours(12, 0, 0, 0);
  return Math.round((target.getTime() - source.getTime()) / 86_400_000);
}

function fieldWorkDay(day: WeatherForecastDay): HarvestWorkDay {
  const rain = finite(day.precipitation);
  const probability = finite(day.precipitationProbability);
  const wind = finite(day.windSpeed);

  const wet = (rain !== null && rain > 3) || (probability !== null && probability >= 65);
  const windy = wind !== null && wind >= 40;
  const caution = (rain !== null && rain > 1) || (probability !== null && probability >= 35) || (wind !== null && wind >= 28);

  if (wet || windy) {
    return {
      date: day.date,
      label: 'uygun_degil',
      precipitationMm: rain,
      precipitationProbabilityPct: probability,
      windKmh: wind,
      reason: wet ? 'Yağış olasılığı/yağış saha çalışmasını zorlaştırabilir.' : 'Kuvvetli rüzgâr saha çalışmasını zorlaştırabilir.',
    };
  }

  if (caution) {
    return {
      date: day.date,
      label: 'temkinli',
      precipitationMm: rain,
      precipitationProbabilityPct: probability,
      windKmh: wind,
      reason: 'Hava tamamen açık değil; hasat öncesi güncel tahmini tekrar kontrol et.',
    };
  }

  return {
    date: day.date,
    label: 'uygun',
    precipitationMm: rain,
    precipitationProbabilityPct: probability,
    windKmh: wind,
    reason: 'Yağış ve kuvvetli rüzgâr açısından belirgin saha engeli görünmüyor.',
  };
}

function resolveStatus(input: HarvestReadinessInput, days: number | null) {
  if (dateOnly(input.actualHarvestDate)) return 'harvested' as const;

  const stages = `${normalize(input.phenologyStage)} ${normalize(input.orchardStage)}`;
  if (/harvest window|hasat penceresi|harvest|hasat/.test(stages)) return 'window' as const;
  if (/maturation|olgunlaş|olgunlas/.test(stages)) return days !== null && days > 21 ? 'approaching' as const : 'window' as const;

  if (days !== null) {
    if (days < -7) return 'window' as const;
    if (days <= 14) return 'window' as const;
    if (days <= 35) return 'approaching' as const;
    return 'early' as const;
  }

  if (text(input.phenologyStage) || text(input.orchardStage)) return 'early' as const;
  return 'insufficient' as const;
}

function copyFor(status: HarvestReadinessSnapshot['status']) {
  if (status === 'harvested') return {
    headline: 'Bu sezon için hasat kaydı var',
    meaning: 'Gerçek hasat kaydı bulunduğu için tahmin yerine kayıt esas alınıyor.',
  };
  if (status === 'window') return {
    headline: 'Hasat dönemi yaklaşmış veya başlamış olabilir',
    meaning: 'Fenoloji ve kayıtlar hasat dönemine yakın olduğumuzu gösteriyor. Son kararı ürünün saha olgunluğu ve kalite ölçümüyle ver.',
  };
  if (status === 'approaching') return {
    headline: 'Hasada yaklaşılıyor',
    meaning: 'Takvim/fenoloji hasadın yaklaştığını gösteriyor. Şimdiden işçilik, ekipman ve pazar hazırlığını planlayabilirsin.',
  };
  if (status === 'early') return {
    headline: 'Hasat için henüz erken görünüyor',
    meaning: 'Mevcut fenoloji/tarih bağlamı hasat penceresinin henüz gelmediğini gösteriyor.',
  };
  return {
    headline: 'Hasat zamanı için veri henüz yetersiz',
    meaning: 'Kesin tarih vermek için fenoloji, sezon veya saha gözlemi gerekiyor.',
  };
}

export function buildHarvestReadiness(input: HarvestReadinessInput): HarvestReadinessSnapshot {
  const now = input.now ?? new Date();
  const expectedDate = dateOnly(input.expectedHarvestDate);
  const derivedDays = finite(input.daysToExpectedHarvest);
  const days = derivedDays === null ? daysBetween(now, expectedDate) : Math.round(derivedDays);
  const status = resolveStatus(input, days);
  const copy = copyFor(status);
  const weatherDays = (input.forecast ?? []).slice(0, 5).map(fieldWorkDay);
  const bestDay = weatherDays.find((day) => day.label === 'uygun') ?? weatherDays.find((day) => day.label === 'temkinli') ?? null;
  const evidence: string[] = [];
  const warnings: string[] = [];

  if (expectedDate) evidence.push(`Beklenen hasat tarihi: ${expectedDate}.`);
  if (days !== null) evidence.push(days >= 0 ? `Beklenen tarihe yaklaşık ${days} gün var.` : `Beklenen tarih yaklaşık ${Math.abs(days)} gün önceydi.`);
  if (text(input.phenologyStage)) evidence.push(`Fenoloji: ${text(input.phenologyStage)}.`);
  if (text(input.orchardStage)) evidence.push(`Son ağaç gözlemi: ${text(input.orchardStage)}.`);
  if (text(input.fruitLoad) && normalize(input.fruitLoad) !== 'unknown') evidence.push(`Meyve yükü gözlemi: ${text(input.fruitLoad)}.`);

  if (!dateOnly(input.actualHarvestDate) && status === 'window') {
    warnings.push('Bu kart “ürün kesin olgun” demez. Renk, sertlik, kuru madde/Brix, nem veya ürüne özgü kalite ölçümü gerekiyorsa saha kontrolü esas alınır.');
  }
  if (!weatherDays.length) warnings.push('5 günlük çalışma havası alınamadı; olgunluk değerlendirmesi kayıt/fenolojiyle devam etti.');

  const signalCount = [expectedDate, text(input.phenologyStage), text(input.orchardStage)].filter(Boolean).length;
  const dataConfidence = input.yieldDataQuality === 'good' && signalCount >= 2
    ? 'high'
    : signalCount >= 2 || input.yieldDataQuality === 'partial'
      ? 'medium'
      : signalCount >= 1
        ? 'low'
        : 'unknown';

  return {
    version: '14.0',
    fieldId: text(input.fieldId),
    crop: text(input.crop) || 'Ürün',
    status,
    headline: copy.headline,
    meaning: copy.meaning,
    expectedHarvestDate: expectedDate,
    daysToExpectedHarvest: status === 'harvested' ? null : days,
    phenologyStage: text(input.phenologyStage) || null,
    orchardStage: text(input.orchardStage) || null,
    fruitLoad: text(input.fruitLoad) || null,
    dataConfidence,
    workWeather: {
      status: weatherDays.length >= 3 ? 'ready' : weatherDays.length ? 'partial' : 'unavailable',
      bestDay,
      days: weatherDays,
      note: 'Hava bölümü yalnız saha çalışması için uygundur; ürün olgunluğunu kanıtlamaz.',
    },
    evidence,
    warnings,
    generatedAt: now.toISOString(),
  };
}
