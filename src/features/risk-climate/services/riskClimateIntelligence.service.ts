import type { WeatherForecastDay } from '../../../types';
import type { AgroClimateBaselineEvidence } from '../../../services/agroClimateBaseline.service';
import {
  fetchHydroBasinContext,
  type HydroBasinContext,
} from '../../../services/hydrologyContextService';
import {
  fetchWaterClimatePoint,
  type WaterClimatePointResult,
} from '../../../services/waterClimateService';
import { fetchOpenMeteoForecast } from '../../../services/weatherService';
import {
  resolveCropPhenologyRiskSensitivity,
} from './cropPhenologyRiskSensitivity.service';
import {
  compactWorldClimReference,
  fetchWorldClimReference,
  type WorldClimReference,
} from './worldClimReference.service';
import {
  compactClimateAnomalyMemory,
  updateClimateAnomalyMemory,
  type ClimateAnomalyMemory,
} from './climateAnomalyMemory.service';
import {
  buildClimateAnomalyPusulaNarrative,
} from './climateAnomalyPusula.service';
import type {
  RiskClimateIntelligence,
  RiskClimateLevel,
  RiskClimateSignal,
  RiskClimateSourceState,
} from '../types/riskClimateIntelligence';

type DiseaseRiskInput = {
  supported: boolean;
  overallScore?: number | null;
  overallLevel?: string | null;
  headline?: string | null;
  topThreat?: {
    name?: string | null;
    score?: number | null;
    level?: string | null;
    peakDate?: string | null;
    reasons?: string[] | null;
    action?: string | null;
  } | null;
};

export type BuildRiskClimateIntelligenceInput = {
  fieldId: string;
  latitude: number;
  longitude: number;
  agroClimate?: AgroClimateBaselineEvidence | null;
  diseaseRisk?: DiseaseRiskInput | null;
  cropName?: string | null;
  phenology?: {
    stage?: string | null;
    stageLabel?: string | null;
    confidence?: string | null;
  } | null;
  forceRefresh?: boolean;
};

const LEVEL_ORDER: Record<RiskClimateLevel, number> = {
  unknown: -1,
  low: 0,
  moderate: 1,
  high: 2,
  critical: 3,
};

function finite(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function levelFromScore(score: number | null): RiskClimateLevel {
  if (score == null) return 'unknown';
  if (score >= 85) return 'critical';
  if (score >= 65) return 'high';
  if (score >= 35) return 'moderate';
  return 'low';
}

function translatedLevel(level: unknown): RiskClimateLevel {
  const value = String(level ?? '').toLowerCase();
  if (value === 'critical') return 'critical';
  if (value === 'high') return 'high';
  if (value === 'moderate') return 'moderate';
  if (value === 'low') return 'low';
  return 'unknown';
}

function forecastStats(forecast: WeatherForecastDay[]) {
  const minTemps = forecast.map((day) => finite(day.tempMin)).filter((v): v is number => v != null);
  const maxTemps = forecast.map((day) => finite(day.tempMax)).filter((v): v is number => v != null);
  const rain = forecast.map((day) => finite(day.precipitation)).filter((v): v is number => v != null);

  return {
    minTemp: minTemps.length ? Math.min(...minTemps) : null,
    maxTemp: maxTemps.length ? Math.max(...maxTemps) : null,
    hotDays: maxTemps.filter((value) => value >= 32).length,
    veryHotDays: maxTemps.filter((value) => value >= 36).length,
    rainTotalMm: rain.length ? rain.reduce((sum, value) => sum + value, 0) : null,
  };
}

function frostSignal(frost: WaterClimatePointResult | null): RiskClimateSignal {
  const minC = finite(frost?.stats?.min);
  const score = minC == null
    ? null
    : minC <= -4
      ? 95
      : minC <= -2
        ? 85
        : minC <= 0
          ? 72
          : minC <= 2
            ? 48
            : 10;

  return {
    key: 'frost',
    label: 'Don',
    status: minC == null ? 'needs_data' : 'ready',
    level: levelFromScore(score),
    score,
    baseScore: score,
    sensitivity: null,
    headline: minC == null ? 'Don tahmini için veri gerekli' : `7 günlük en düşük sıcaklık ${minC.toFixed(1)} °C`,
    summary: minC == null
      ? 'Kısa vadeli minimum sıcaklık serisi alınamadı.'
      : 'Bu genel sıcaklık sinyalidir; ürün ve fenolojiye özgü don eşiği bir sonraki karar katmanında uygulanır.',
    evidence: minC == null ? [] : [`Open-Meteo 7 günlük saatlik tahminde minimum ${minC.toFixed(1)} °C.`],
    action: minC != null && minC <= 2
      ? 'Ürünün güncel gelişim evresine özgü don hassasiyetini kontrol et.'
      : 'Kısa vadeli minimum sıcaklıkları izlemeye devam et.',
    confidence: minC == null ? 'unknown' : 'medium',
    productionAuthority: true,
  };
}

function heatSignal(forecast: WeatherForecastDay[]): RiskClimateSignal {
  const stats = forecastStats(forecast);
  const score = stats.maxTemp == null
    ? null
    : stats.veryHotDays >= 2
      ? 90
      : stats.veryHotDays === 1
        ? 78
        : stats.hotDays >= 2
          ? 62
          : stats.hotDays === 1
            ? 45
            : 10;

  return {
    key: 'heat',
    label: 'Sıcaklık Stresi',
    status: stats.maxTemp == null ? 'needs_data' : 'ready',
    level: levelFromScore(score),
    score,
    baseScore: score,
    sensitivity: null,
    headline: stats.maxTemp == null ? 'Sıcaklık tahmini için veri gerekli' : `5 günlük en yüksek sıcaklık ${stats.maxTemp.toFixed(1)} °C`,
    summary: stats.maxTemp == null
      ? 'Kısa vadeli maksimum sıcaklık serisi alınamadı.'
      : `${stats.hotDays} gün 32 °C ve üzeri${stats.veryHotDays ? `; ${stats.veryHotDays} gün 36 °C ve üzeri` : ''}. Ürün/fenoloji eşiği ayrıca uygulanmalıdır.`,
    evidence: stats.maxTemp == null ? [] : [`Open-Meteo 5 günlük tahmin: maksimum ${stats.maxTemp.toFixed(1)} °C.`],
    action: score != null && score >= 35
      ? 'Su durumu, fenoloji ve ürün hassasiyetiyle birlikte sıcaklık stresini değerlendir.'
      : 'Kısa vadeli sıcaklık seyrini izlemeye devam et.',
    confidence: stats.maxTemp == null ? 'unknown' : 'medium',
    productionAuthority: true,
  };
}

function droughtSignal(agro: AgroClimateBaselineEvidence | null | undefined): RiskClimateSignal {
  const klass = agro?.climateWaterStress?.class ?? null;
  const score = klass === 'strong_dry_signal'
    ? 88
    : klass === 'dry_signal'
      ? 65
      : klass === 'near_normal'
        ? 15
        : klass === 'wet_signal'
          ? 5
          : null;

  const deficit = agro?.anomalies?.precipitationDeficitPct ?? null;
  const soilPct = agro?.anomalies?.soilMoisture7To28Percentile ?? null;

  return {
    key: 'drought',
    label: 'Kuraklık / Su Açığı',
    status: klass ? 'ready' : 'needs_data',
    level: levelFromScore(score),
    score,
    baseScore: score,
    sensitivity: null,
    headline: klass ? (agro?.climateWaterStress?.label || 'Agroiklim su açığı sinyali') : 'Kuraklık bağlamı için veri gerekli',
    summary: klass
      ? 'CHIRPS yağış kanıtı ile ERA5-Land sıcaklık, ET₀, su dengesi ve toprak nemi aynı sonuç gibi körlemesine ortalanmadan birlikte değerlendirilir.'
      : 'Agroiklim karşılaştırması henüz hazır değil.',
    evidence: [
      deficit != null ? `Yağış açığı: %${Math.round(deficit)}.` : '',
      soilPct != null ? `7–28 cm toprak nemi yüzdeliği: ${Math.round(soilPct)}.` : '',
    ].filter(Boolean),
    action: score != null && score >= 35
      ? 'Sulama durumu, kök bölgesi nemi ve ürünün gelişim evresiyle birlikte su açığını doğrula.'
      : 'Agroiklim su dengesini izlemeye devam et.',
    confidence: agro?.climateWaterStress?.confidence === 'medium' ? 'medium' : klass ? 'low' : 'unknown',
    productionAuthority: true,
  };
}

function excessWaterSignal(
  agro: AgroClimateBaselineEvidence | null | undefined,
  hydro: HydroBasinContext | null,
  forecast: WeatherForecastDay[],
): RiskClimateSignal {
  const wetClimate = agro?.climateWaterStress?.class === 'wet_signal';
  const rainTotal = forecastStats(forecast).rainTotalMm;
  const waterSignal = hydro?.surfaceWaterHistory?.waterSignal ?? 'unknown';
  const historicalWater = waterSignal === 'recurring' || waterSignal === 'persistent';
  const heavyRain = rainTotal != null && rainTotal >= 25;

  let score: number | null = null;
  if (heavyRain && wetClimate) score = historicalWater ? 82 : 68;
  else if (heavyRain) score = historicalWater ? 66 : 52;
  else if (wetClimate) score = historicalWater ? 58 : 42;
  else if (historicalWater) score = 28;
  else if (rainTotal != null || agro || hydro) score = 10;

  return {
    key: 'excess_water',
    label: 'Fazla Su / Drenaj',
    status: score == null ? 'needs_data' : 'supporting',
    level: levelFromScore(score),
    score,
    baseScore: score,
    sensitivity: null,
    headline: score == null
      ? 'Fazla su bağlamı için veri gerekli'
      : score >= 65
        ? 'Yağış ve su bağlamı birlikte dikkat çekiyor'
        : 'Fazla su / drenaj bağlamı izlendi',
    summary: 'JRC geçmiş yüzey suyu ve HydroSHEDS havza verileri güncel taşkın tahmini değildir; yalnızca yağış/agroiklim sinyalini destekleyen tarihsel-hidrolojik bağlamdır.',
    evidence: [
      rainTotal != null ? `5 günlük tahmini yağış toplamı ${rainTotal.toFixed(1)} mm.` : '',
      wetClimate ? 'Agroiklim sınıfı ıslak sinyal gösteriyor.' : '',
      historicalWater ? `JRC tarihsel su sinyali: ${waterSignal}.` : '',
      hydro?.nearestRiver?.distanceM != null ? `HydroRIVERS en yakın akarsu yaklaşık ${Math.round(hydro.nearestRiver.distanceM)} m.` : '',
    ].filter(Boolean),
    action: score != null && score >= 35
      ? 'Yağış sonrası düşük kotlu ve drenajı zayıf alanları saha gözlemi/radar su katmanıyla doğrula.'
      : 'Yağış ve drenaj koşullarını izlemeye devam et.',
    confidence: score == null ? 'unknown' : historicalWater || wetClimate ? 'medium' : 'low',
    productionAuthority: true,
  };
}

function needsDataSignal(
  key: 'salinity' | 'hail_post_event',
  label: string,
  headline: string,
  summary: string,
  action: string,
): RiskClimateSignal {
  return {
    key,
    label,
    status: 'needs_data',
    level: 'unknown',
    score: null,
    baseScore: null,
    sensitivity: null,
    headline,
    summary,
    evidence: [],
    action,
    confidence: 'unknown',
    productionAuthority: true,
  };
}

function diseaseSignal(input: DiseaseRiskInput | null | undefined): RiskClimateSignal {
  const top = input?.topThreat ?? null;
  const score = finite(top?.score ?? input?.overallScore);
  const level = translatedLevel(top?.level ?? input?.overallLevel);

  return {
    key: 'disease_weather_window',
    label: 'Hastalık İçin Uygun Hava',
    status: input?.supported ? 'supporting' : 'needs_data',
    level: level !== 'unknown' ? level : levelFromScore(score),
    score: score == null ? null : clampScore(score),
    baseScore: score == null ? null : clampScore(score),
    sensitivity: null,
    headline: top?.name ? `${top.name} için çevresel risk sinyali` : (input?.headline || 'Hastalık hava penceresi için doğrulanmış model gerekli'),
    summary: input?.supported
      ? 'Bu sinyal mevcut Risk Radar hastalık/zararlı modelinden gelir; kesin teşhis değildir ve fotoğraf/saha bulgusundan ayrı tutulur.'
      : 'Bu ürün için doğrulanmış hastalık/zararlı çevresel modeli yoksa risk yüzdesi üretilmez.',
    evidence: Array.isArray(top?.reasons) ? (top.reasons ?? []).slice(0, 3) : [],
    action: top?.action || 'Risk yükselirse saha kontrolü ve gerekirse fotoğraf doğrulaması yap.',
    confidence: input?.supported && score != null ? 'medium' : 'unknown',
    productionAuthority: true,
  };
}


function applyCropPhenologySensitivity(
  signal: RiskClimateSignal,
  input: BuildRiskClimateIntelligenceInput,
): RiskClimateSignal {
  const baseScore = signal.baseScore ?? signal.score;
  const sensitivity = resolveCropPhenologyRiskSensitivity({
    cropName: input.cropName,
    signal: signal.key,
    phenologyStage: input.phenology?.stage,
    phenologyStageLabel: input.phenology?.stageLabel,
  });

  if (baseScore == null || !sensitivity.applied) {
    return {
      ...signal,
      baseScore,
      sensitivity,
    };
  }

  const adjustedScore = clampScore(baseScore * sensitivity.factor);
  const stageText = sensitivity.phenologyStageLabel || sensitivity.phenologyStage;
  const contextEvidence = [
    sensitivity.cropName ? `Ürün: ${sensitivity.cropName}.` : '',
    stageText ? `Fenoloji: ${stageText}.` : '',
    `Ham iklim skoru ${baseScore}; ürün/fenoloji hassasiyeti sonrası karar skoru ${adjustedScore}.`,
  ].filter(Boolean).join(' ');

  return {
    ...signal,
    baseScore,
    score: adjustedScore,
    level: levelFromScore(adjustedScore),
    sensitivity,
    summary: `${signal.summary} ${sensitivity.reason}`.trim(),
    evidence: [...signal.evidence, contextEvidence].filter(Boolean).slice(0, 4),
  };
}


function applyWorldClimReferenceContext(
  signal: RiskClimateSignal,
  worldClim: WorldClimReference | null,
): RiskClimateSignal {
  if (!worldClim || worldClim.status !== 'ready') return signal;

  const variables = worldClim.variables;
  const evidence: string[] = [];

  if (
    signal.key === 'frost' &&
    variables.minTemperatureColdestMonthC != null
  ) {
    evidence.push(
      `WorldClim 1970–2000: en soğuk ayın uzun dönem minimum sıcaklık ortalaması ${variables.minTemperatureColdestMonthC.toFixed(1)} °C.`,
    );
  }

  if (
    signal.key === 'heat' &&
    variables.maxTemperatureWarmestMonthC != null
  ) {
    evidence.push(
      `WorldClim 1970–2000: en sıcak ayın uzun dönem maksimum sıcaklık ortalaması ${variables.maxTemperatureWarmestMonthC.toFixed(1)} °C.`,
    );
  }

  if (signal.key === 'drought') {
    if (variables.annualPrecipitationMm != null) {
      evidence.push(
        `WorldClim 1970–2000 yıllık yağış normali yaklaşık ${Math.round(variables.annualPrecipitationMm)} mm.`,
      );
    }

    if (variables.precipitationSeasonalityCv != null) {
      evidence.push(
        `WorldClim yağış mevsimselliği (BIO15) ${variables.precipitationSeasonalityCv.toFixed(1)}.`,
      );
    }
  }

  if (signal.key === 'excess_water') {
    if (variables.precipitationWettestMonthMm != null) {
      evidence.push(
        `WorldClim 1970–2000 en yağışlı ay normali yaklaşık ${Math.round(variables.precipitationWettestMonthMm)} mm.`,
      );
    }

    if (variables.precipitationDriestMonthMm != null) {
      evidence.push(
        `WorldClim en kurak ay normali yaklaşık ${Math.round(variables.precipitationDriestMonthMm)} mm.`,
      );
    }
  }

  if (!evidence.length) return signal;

  return {
    ...signal,
    summary:
      `${signal.summary} WorldClim yalnız uzun dönem klimatoloji referansı olarak kullanılır; kısa vadeli risk skorunu değiştirmez.`.trim(),
    evidence: [...signal.evidence, ...evidence].filter(Boolean).slice(0, 6),
  };
}


function applyClimateAnomalyMemoryContext(
  signal: RiskClimateSignal,
  memory: ClimateAnomalyMemory | null,
): RiskClimateSignal {
  if (!memory?.latest) return signal;

  const evidence: string[] = [];
  const persistence = memory.persistence;

  if (signal.key === 'drought') {
    if (persistence.persistentDry) {
      evidence.push(
        `İklim hafızası: kurak sapma son kayıtlarda kalıcı (${Math.max(
          persistence.consecutiveDrySnapshots,
          persistence.drySnapshots,
        )} tekrar).`,
      );
    }
    if (memory.trend === 'drying') {
      evidence.push('İklim hafızası: son iki karşılaştırmada kuruma yönü güçleniyor.');
    }
  }

  if (signal.key === 'heat') {
    if (persistence.persistentWarm) {
      evidence.push(
        `İklim hafızası: sıcak sapma son kayıtlarda kalıcı (${Math.max(
          persistence.consecutiveWarmSnapshots,
          persistence.warmSnapshots,
        )} tekrar).`,
      );
    }
    if (memory.trend === 'warming') {
      evidence.push('İklim hafızası: son iki karşılaştırmada sıcak sapma artıyor.');
    }
  }

  if (signal.key === 'excess_water') {
    if (memory.trend === 'wetting') {
      evidence.push('İklim hafızası: son iki karşılaştırmada daha ıslak yöne gidiş var.');
    }
    if (persistence.wetSnapshots >= 3) {
      evidence.push(`İklim hafızası: son ${Math.min(6, memory.historyCount)} kaydın ${persistence.wetSnapshots} tanesi ıslak sapma gösteriyor.`);
    }
  }

  if (!evidence.length) return signal;

  return {
    ...signal,
    summary: `${signal.summary} Sezon anomalisi hafızası yalnız süreklilik bağlamı sağlar; kısa vadeli risk skorunu değiştirmez.`.trim(),
    evidence: [...signal.evidence, ...evidence].filter(Boolean).slice(0, 7),
  };
}

export async function fetchRiskClimateIntelligence(
  input: BuildRiskClimateIntelligenceInput,
): Promise<RiskClimateIntelligence> {
  const { fieldId, latitude, longitude, agroClimate, diseaseRisk } = input;

  const [forecastResult, frostResult, hydroResult, worldClimResult] = await Promise.allSettled([
    fetchOpenMeteoForecast(latitude, longitude),
    fetchWaterClimatePoint(latitude, longitude, 'frost_risk', 7),
    fetchHydroBasinContext(latitude, longitude, { forceRefresh: input.forceRefresh }),
    fetchWorldClimReference({
      fieldId,
      latitude,
      longitude,
      forceRefresh: input.forceRefresh,
    }),
  ]);

  const forecast = forecastResult.status === 'fulfilled' ? forecastResult.value : [];
  const frost = frostResult.status === 'fulfilled' ? frostResult.value : null;
  const hydro = hydroResult.status === 'fulfilled' ? hydroResult.value : null;
  const worldClim = worldClimResult.status === 'fulfilled' ? worldClimResult.value : null;

  const anomalyMemory = await updateClimateAnomalyMemory({
    fieldId,
    agroClimate,
    worldClim,
  }).catch(() => null);

  const memoryNarrative = anomalyMemory
    ? buildClimateAnomalyPusulaNarrative(anomalyMemory)
    : null;

  const signals: RiskClimateSignal[] = [
    frostSignal(frost),
    heatSignal(forecast),
    droughtSignal(agroClimate),
    excessWaterSignal(agroClimate, hydro, forecast),
    needsDataSignal(
      'salinity',
      'Tuzluluk',
      'Tuzluluk için doğrulanmış ölçüm gerekli',
      'İklim veya uydu verisinden tek başına tuzluluk teşhisi üretmiyoruz. EC/laboratuvar veya doğrulanmış tuzluluk girdisi gerekir.',
      'Toprak analizi veya doğrulanmış EC kaydı ekle.',
    ),
    needsDataSignal(
      'hail_post_event',
      'Dolu Sonrası',
      'Dolu olayı doğrulanmadan hasar riski üretilmez',
      'Dolu sonrası değerlendirme için gerçekleşmiş hava olayı veya saha/fotoğraf kanıtı gerekir.',
      'Dolu olayı sonrası saha fotoğrafı ve gözlem kaydı ekle.',
    ),
    diseaseSignal(diseaseRisk),
  ]
    .map((signal) => applyCropPhenologySensitivity(signal, input))
    .map((signal) => applyWorldClimReferenceContext(signal, worldClim))
    .map((signal) => applyClimateAnomalyMemoryContext(signal, anomalyMemory))
    .sort((a, b) => LEVEL_ORDER[b.level] - LEVEL_ORDER[a.level] || (b.score ?? -1) - (a.score ?? -1));

  const sourceStates: RiskClimateSourceState[] = [
    {
      key: 'era5_land',
      label: 'ERA5-Land',
      status: agroClimate?.era5Land ? 'ready' : 'unavailable',
      role: 'Sıcaklık, ET₀, su dengesi ve toprak nemi agroiklim karşılaştırması',
    },
    {
      key: 'chirps',
      label: 'CHIRPS',
      status: agroClimate?.chirps?.pending ? 'pending' : agroClimate?.chirps?.available ? 'ready' : 'partial',
      role: 'Yağış kanıtı; ERA5-Land ile körlemesine ortalanmaz',
    },
    {
      key: 'forecast',
      label: 'Kısa Vadeli Hava',
      status: forecast.length ? 'ready' : 'unavailable',
      role: 'Don, sıcaklık ve yaklaşan yağış penceresi',
    },
    {
      key: 'hydrosheds',
      label: 'HydroSHEDS',
      status: hydro?.ok ? 'ready' : 'unavailable',
      role: 'Havza/akarsu bağlamı; tek başına taşkın tahmini değildir',
    },
    {
      key: 'jrc_surface_water',
      label: 'JRC Global Surface Water',
      status: hydro?.surfaceWaterHistory?.ok ? 'ready' : 'unavailable',
      role: 'Tarihsel yüzey suyu davranışı; güncel su baskını kanıtı değildir',
    },
    {
      key: 'worldclim',
      label: 'WorldClim',
      status: worldClim?.status === 'ready' ? 'ready' : 'unavailable',
      role: '1970–2000 uzun dönem klimatoloji referansı; kısa vadeli risk skorunu tek başına değiştirmez',
    },
    {
      key: 'disease_risk_engine',
      label: 'Risk Radar Hastalık/Zararlı Modeli',
      status: diseaseRisk?.supported ? 'ready' : 'partial',
      role: 'Ürün/tehdit özel çevresel risk; teşhis otoritesi değildir',
    },
  ];

  const readyCount = sourceStates.filter((source) => source.status === 'ready').length;
  const topSignal = signals.find((signal) => signal.score != null) ?? null;

  return {
    version: '12.6',
    fieldId,
    status: readyCount >= 4 ? 'ready' : readyCount >= 2 ? 'partial' : 'needs_data',
    productionAuthority: true,
    signals,
    sourceStates,
    topSignal,
    worldClimReference: compactWorldClimReference(worldClim),
    climateAnomalyMemory: compactClimateAnomalyMemory(anomalyMemory),
    memoryNarrative,
    guardrails: {
      worldClimNotFabricated: true,
      jrcIsHistoricalContextOnly: true,
      salinityNeedsMeasuredOrValidatedInput: true,
      hailNeedsObservedEvent: true,
      diseaseDiagnosisAuthority: false,
      rawClimateScorePreserved: true,
      phenologySensitivityDoesNotCreateDiagnosis: true,
      worldClimReferenceDoesNotAlterShortTermScore: true,
      anomalyMemoryDoesNotAlterShortTermScore: true,
    },
    generatedAt: new Date().toISOString(),
  };
}

export function compactRiskClimateForPusula(
  value: RiskClimateIntelligence | null | undefined,
) {
  if (!value) return null;
  return {
    version: value.version,
    status: value.status,
    topSignal: value.topSignal
      ? {
          key: value.topSignal.key,
          label: value.topSignal.label,
          level: value.topSignal.level,
          score: value.topSignal.score,
          baseScore: value.topSignal.baseScore,
          sensitivity: value.topSignal.sensitivity,
          headline: value.topSignal.headline,
          action: value.topSignal.action,
        }
      : null,
    signals: value.signals.map((signal) => ({
      key: signal.key,
      label: signal.label,
      status: signal.status,
      level: signal.level,
      score: signal.score,
      baseScore: signal.baseScore,
      sensitivity: signal.sensitivity,
      headline: signal.headline,
      evidence: signal.evidence.slice(0, 2),
    })),
    sources: value.sourceStates,
    worldClimReference: value.worldClimReference,
    climateAnomalyMemory: value.climateAnomalyMemory,
    memoryNarrative: value.memoryNarrative,
    guardrails: value.guardrails,
    generatedAt: value.generatedAt,
  };
}
