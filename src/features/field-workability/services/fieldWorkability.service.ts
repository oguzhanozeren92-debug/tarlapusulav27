import { supabase } from '../../../supabaseClient';
import { loadSoilWaterProfile } from '../../irrigation/services/soilWaterProfile.service';
import { listSoilWaterMeasurements } from '../../irrigation/services/soilWaterMeasurement.service';
import { listRecentFieldOperations } from '../../field-operations/services/fieldOperation.service';
import type { FieldOperation } from '../../field-operations/types/fieldOperation';
import type { SoilWaterProfile } from '../../irrigation/types/soilWaterProfile';
import type {
  FieldWorkabilityLoadOptions,
  FieldWorkabilitySnapshot,
} from '../types/fieldWorkability';

function finite(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clean(value: unknown) {
  return String(value ?? '').trim();
}

function round(value: number | null, digits = 3) {
  return value == null ? null : Number(value.toFixed(digits));
}

function hoursBetween(earlier: string | Date | null, later: Date) {
  if (!earlier) return null;
  const parsed = earlier instanceof Date ? earlier : new Date(earlier);
  const ms = later.getTime() - parsed.getTime();
  if (!Number.isFinite(parsed.getTime()) || !Number.isFinite(ms)) return null;
  return Math.max(0, ms / 3_600_000);
}

function localDayToNoon(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function thresholdForProfile(profile: SoilWaterProfile) {
  const { sandPercent, clayPercent, siltPercent } = profile.texture;

  // Bu bantlar geoteknik taşıma kapasitesi değildir. Yalnız tekstüre göre
  // konservatif bir tarla-trafik ön taraması üretmek için kullanılır.
  if (clayPercent >= 40 || (clayPercent >= 35 && siltPercent >= 35)) {
    return { ratio: 0.85, label: 'ince/killi tekstür · %85 TK ön-tarama eşiği' };
  }
  if (sandPercent >= 70 && clayPercent < 20) {
    return { ratio: 0.95, label: 'kumlu tekstür · %95 TK ön-tarama eşiği' };
  }
  return { ratio: 0.9, label: 'orta tekstür · %90 TK ön-tarama eşiği' };
}

function latestIrrigation(operations: FieldOperation[], now: Date) {
  const row = operations.find((operation) => {
    const haystack = `${operation.type} ${operation.title}`.toLocaleLowerCase('tr-TR');
    return /sulama|irrigation/.test(haystack);
  });
  if (!row) return { date: null, hours: null };
  const when = localDayToNoon(row.date) ?? new Date(row.createdAt);
  return {
    date: row.date,
    hours: Number.isFinite(when.getTime()) ? Math.max(0, (now.getTime() - when.getTime()) / 3_600_000) : null,
  };
}

type AutomaticWeatherContext = {
  modeledSurface: { value: number; observedAt: string } | null;
  rainLast24hMm: number | null;
  rainLast48hMm: number | null;
  rainLast72hMm: number | null;
  forecastNext12hMm: number | null;
  forecastNext12hMaxChance: number | null;
};

async function fetchAutomaticWeatherContext(
  latitude: number,
  longitude: number,
  now: Date,
): Promise<AutomaticWeatherContext | null> {
  const params = new URLSearchParams({
    latitude: latitude.toFixed(5),
    longitude: longitude.toFixed(5),
    hourly: 'precipitation,precipitation_probability,soil_moisture_0_to_7cm',
    past_days: '3',
    forecast_days: '2',
    timezone: 'UTC',
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'TarlaPusula-Field-Workability/21.1' },
    });
    if (!response.ok) return null;
    const payload = await response.json().catch(() => null);
    const times = Array.isArray(payload?.hourly?.time) ? payload.hourly.time.map(String) : [];
    const precipitation = Array.isArray(payload?.hourly?.precipitation) ? payload.hourly.precipitation : [];
    const probability = Array.isArray(payload?.hourly?.precipitation_probability)
      ? payload.hourly.precipitation_probability
      : [];
    const moisture = Array.isArray(payload?.hourly?.soil_moisture_0_to_7cm)
      ? payload.hourly.soil_moisture_0_to_7cm
      : [];
    if (!times.length) return null;

    const nowMs = now.getTime();
    const rows = times.map((time, index) => {
      const ts = new Date(`${time}Z`);
      return {
        ts,
        precipitation: finite(precipitation[index]),
        probability: finite(probability[index]),
        moisture: finite(moisture[index]),
      };
    }).filter((row) => Number.isFinite(row.ts.getTime()));

    const sumRain = (hours: number) => {
      const start = nowMs - hours * 3_600_000;
      const values = rows
        .filter((row) => row.ts.getTime() > start && row.ts.getTime() <= nowMs)
        .map((row) => row.precipitation)
        .filter((value): value is number => value != null && value >= 0);
      return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
    };

    const future = rows.filter((row) => row.ts.getTime() > nowMs && row.ts.getTime() <= nowMs + 12 * 3_600_000);
    const futureRain = future
      .map((row) => row.precipitation)
      .filter((value): value is number => value != null && value >= 0);
    const futureChance = future
      .map((row) => row.probability)
      .filter((value): value is number => value != null && value >= 0);

    let modeledSurface: AutomaticWeatherContext['modeledSurface'] = null;
    for (const row of rows) {
      if (row.ts.getTime() > nowMs + 60 * 60 * 1000 || row.moisture == null) continue;
      modeledSurface = { value: row.moisture, observedAt: row.ts.toISOString() };
    }

    return {
      modeledSurface,
      rainLast24hMm: sumRain(24),
      rainLast48hMm: sumRain(48),
      rainLast72hMm: sumRain(72),
      forecastNext12hMm: futureRain.length ? futureRain.reduce((sum, value) => sum + value, 0) : null,
      forecastNext12hMaxChance: futureChance.length ? Math.max(...futureChance) : null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function terrainStats(terrain: FieldWorkabilityLoadOptions['terrain']) {
  const slopes = (terrain?.cells ?? [])
    .map((cell) => finite(cell.slopeDeg))
    .filter((value): value is number => value != null);
  if (!slopes.length) {
    return {
      source: terrain?.source ?? null,
      resolutionMeters: terrain?.resolutionMeters ?? null,
      meanSlopeDeg: null,
      maxSlopeDeg: null,
      steepCellShare: null,
    };
  }
  const mean = slopes.reduce((sum, value) => sum + value, 0) / slopes.length;
  const steep = slopes.filter((value) => value >= 8).length / slopes.length;
  return {
    source: terrain?.source ?? null,
    resolutionMeters: terrain?.resolutionMeters ?? null,
    meanSlopeDeg: round(mean, 1),
    maxSlopeDeg: round(Math.max(...slopes), 1),
    steepCellShare: round(steep, 2),
  };
}

export async function loadFieldWorkabilitySnapshot(
  fieldIdInput: string,
  options: FieldWorkabilityLoadOptions = {},
): Promise<FieldWorkabilitySnapshot> {
  const fieldId = clean(fieldIdInput);
  if (!fieldId) throw new Error('Tarlaya giriş değerlendirmesi için tarla seçilemedi.');

  const now = options.now ?? new Date();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error('Tarlaya giriş değerlendirmesi için oturum gerekli.');

  const { data: field, error: fieldError } = await supabase
    .from('fields')
    .select('id,latitude,longitude,parcel_centroid_lat,parcel_centroid_lng')
    .eq('id', fieldId)
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (fieldError) throw fieldError;
  if (!field) throw new Error('Tarlaya giriş değerlendirmesi için tarla bulunamadı.');

  const latitude = finite(field.parcel_centroid_lat) ?? finite(field.latitude);
  const longitude = finite(field.parcel_centroid_lng) ?? finite(field.longitude);

  const [profileResult, measurementResult, operationsResult, automaticWeatherResult] = await Promise.allSettled([
    loadSoilWaterProfile({ id: fieldId }),
    listSoilWaterMeasurements(fieldId, 25),
    listRecentFieldOperations(fieldId, 10, 25),
    latitude != null && longitude != null
      ? fetchAutomaticWeatherContext(latitude, longitude, now)
      : Promise.resolve(null),
  ]);

  const profile = profileResult.status === 'fulfilled' ? profileResult.value : null;
  const measurements = measurementResult.status === 'fulfilled' ? measurementResult.value : [];
  const operations = operationsResult.status === 'fulfilled' ? operationsResult.value : [];
  const automaticWeather = automaticWeatherResult.status === 'fulfilled' ? automaticWeatherResult.value : null;
  const modeled = automaticWeather?.modeledSurface ?? null;

  // Ölçüm sensörü olan kullanıcıda gerçek kayıt daha güçlü kanıttır; olmayan kullanıcıda
  // kart otomatik veriyle çalışmaya devam eder. Manuel ölçüm hiçbir zaman zorunlu değildir.
  const surfaceMeasurement = measurements.find((item) => {
    const age = hoursBetween(item.measuredAt, now);
    const overlapsSurface = item.depthFromCm <= 10 && item.depthToCm > 0 && item.depthFromCm < 15;
    return overlapsSurface && age != null && age <= 72;
  }) ?? null;

  const waterSource = surfaceMeasurement
    ? 'verified_measurement' as const
    : modeled
      ? 'open_meteo_model' as const
      : 'missing' as const;
  const waterValue = surfaceMeasurement?.volumetricWaterContent ?? modeled?.value ?? null;
  const observedAt = surfaceMeasurement?.measuredAt ?? modeled?.observedAt ?? null;
  const waterAgeHours = hoursBetween(observedAt, now);
  const threshold = profile ? thresholdForProfile(profile) : null;
  const ratioToFieldCapacity = profile && waterValue != null && profile.fieldCapacityVol > 0
    ? waterValue / profile.fieldCapacityVol
    : null;
  const irrigation = latestIrrigation(operations, now);
  const rainMm = finite(options.rainMm);
  const rainChance = finite(options.rainChance);
  const terrain = terrainStats(options.terrain ?? null);

  const rain24 = automaticWeather?.rainLast24hMm ?? null;
  const rain48 = automaticWeather?.rainLast48hMm ?? null;
  const rain72 = automaticWeather?.rainLast72hMm ?? null;
  const forecast12 = automaticWeather?.forecastNext12hMm ?? null;
  const forecastChance12 = automaticWeather?.forecastNext12hMaxChance ?? null;

  const evidence: string[] = [];
  if (surfaceMeasurement) {
    evidence.push(`Varsa sensör/saha kaydı: yüzey nemi ${surfaceMeasurement.volumetricWaterContent.toFixed(3)} m³/m³ · ${surfaceMeasurement.depthFromCm}-${surfaceMeasurement.depthToCm} cm.`);
  } else if (modeled) {
    evidence.push(`Open-Meteo 0–7 cm toprak nemi model bağlamı ${modeled.value.toFixed(3)} m³/m³; saha ölçümü değildir.`);
  } else {
    evidence.push('Open-Meteo yüzey nemi model bağlamı alınamadı; karar yağış/sulama/toprak/eğim üzerinden sınırlandırıldı.');
  }
  if (automaticWeather) {
    evidence.push(`Otomatik yağış geçmişi: 24 sa ${rain24?.toFixed(1) ?? '—'} · 48 sa ${rain48?.toFixed(1) ?? '—'} · 72 sa ${rain72?.toFixed(1) ?? '—'} mm.`);
    evidence.push(`Önümüzdeki 12 sa: ${forecast12?.toFixed(1) ?? '—'} mm · en yüksek yağış olasılığı ${forecastChance12 != null ? `%${Math.round(forecastChance12)}` : '—'}.`);
  } else if (rainMm != null || rainChance != null) {
    evidence.push(`Ana hava verisi: ${rainMm != null ? `${rainMm.toFixed(1)} mm` : 'miktar yok'}${rainChance != null ? ` · %${Math.round(rainChance)} yağış olasılığı` : ''}.`);
  }
  if (profile && threshold) {
    evidence.push(`Tarla kapasitesi ${profile.fieldCapacityVol.toFixed(3)} m³/m³; ${threshold.label}.`);
    evidence.push(`Tekstür: kum %${profile.texture.sandPercent.toFixed(0)} · kil %${profile.texture.clayPercent.toFixed(0)} · silt %${profile.texture.siltPercent.toFixed(0)}.`);
  }
  if (irrigation.date) evidence.push(`Son kayıtlı sulama: ${irrigation.date}.`);
  if (terrain.meanSlopeDeg != null) {
    evidence.push(`DEM eğim bağlamı: ort. ${terrain.meanSlopeDeg.toFixed(1)}° · maks. ${terrain.maxSlopeDeg?.toFixed(1) ?? '—'}°.`);
  }

  let status: FieldWorkabilitySnapshot['status'] = 'needs_data';
  let confidence: FieldWorkabilitySnapshot['confidence'] = 'preliminary';
  let headline = 'Bugün Tarlaya Giriş Belirsiz';
  let summary = 'Otomatik hava/toprak bağlamının bir bölümü eksik; Pusula güvenli tarafta kalıyor.';

  const thresholdRatio = threshold?.ratio ?? null;
  const recentIrrigation = irrigation.hours != null && irrigation.hours <= 48;
  const veryRecentIrrigation = irrigation.hours != null && irrigation.hours <= 24;
  const recentRainHigh = (rain24 != null && rain24 >= 10) || (rain48 != null && rain48 >= 20) || (rain72 != null && rain72 >= 30);
  const recentRainModerate = (rain24 != null && rain24 >= 4) || (rain48 != null && rain48 >= 10) || (rain72 != null && rain72 >= 15);
  const forecastPressure = (forecast12 != null && forecast12 >= 4) || (forecastChance12 != null && forecastChance12 >= 70);
  const homeRainPressure = (rainMm != null && rainMm >= 5) || (rainChance != null && rainChance >= 70);
  const wettingPressure = recentIrrigation || recentRainModerate || forecastPressure || homeRainPressure;
  const steepPressure = terrain.steepCellShare != null && terrain.steepCellShare >= 0.3;
  const fineTexture = (profile?.texture.clayPercent ?? 0) >= 35 || (profile?.texture.siltPercent ?? 0) >= 45;
  const drySpell = automaticWeather != null
    && (rain72 ?? 0) <= 2
    && (forecast12 ?? 0) < 2
    && (forecastChance12 ?? 0) < 50
    && (irrigation.hours == null || irrigation.hours > 72);

  if (ratioToFieldCapacity != null && thresholdRatio != null) {
    const wet = ratioToFieldCapacity >= thresholdRatio;
    const veryWet = ratioToFieldCapacity >= thresholdRatio + 0.08;
    const near = ratioToFieldCapacity >= Math.max(0.65, thresholdRatio - 0.08);
    const clearlyDry = ratioToFieldCapacity < Math.max(0.55, thresholdRatio - 0.12);

    confidence = waterSource === 'verified_measurement'
      ? profile?.source === 'laboratory' ? 'strong' : 'medium'
      : automaticWeather && profile ? 'medium' : 'preliminary';

    if (veryWet || (wet && (veryRecentIrrigation || recentRainHigh))) {
      status = 'wait';
      headline = 'Bugün Ağır Makineyle Girmeyi Ertele';
      summary = 'Yüzey ıslaklık sinyali tekstüre göre yüksek; teker izi ve sıkışma riski artmış görünüyor.';
    } else if (wet || near || wettingPressure || steepPressure) {
      status = 'caution';
      headline = 'Bugün Tarlaya Girişte Dikkat';
      summary = 'Nem/yağış/sulama veya eğim bağlamı sınırda; ağır makineyle girişte iz yapma riski olabilir.';
    } else if (clearlyDry) {
      status = 'suitable';
      headline = 'Bugün Tarlaya Giriş Uygun Görünüyor';
      summary = 'Otomatik nem, son yağış, sulama ve topoğrafya birlikte düşük yüzey riski gösteriyor.';
    } else {
      status = 'caution';
      headline = 'Bugün Tarlaya Giriş Sınırda';
      summary = 'Otomatik nem sinyali güvenli eşikten yeterince uzak değil; ağır makine kullanımında temkinli ol.';
    }
  } else if (veryRecentIrrigation || recentRainHigh) {
    status = fineTexture || steepPressure ? 'wait' : 'caution';
    confidence = profile && automaticWeather ? 'medium' : 'preliminary';
    headline = status === 'wait'
      ? 'Bugün Ağır Makineyle Girmeyi Ertele'
      : 'Bugün Tarlaya Girişte Dikkat';
    summary = 'Yakın sulama/yoğun yağış yüzeyin henüz taşıma açısından riskli olabileceğini gösteriyor.';
  } else if (wettingPressure || steepPressure) {
    status = 'caution';
    confidence = profile || automaticWeather ? 'medium' : 'preliminary';
    headline = 'Bugün Tarlaya Girişte Dikkat';
    summary = 'Yağış/sulama/tahmin veya eğim bağlamı nedeniyle ağır makine için temkinli bir pencere.';
  } else if (drySpell && profile) {
    status = 'suitable';
    confidence = 'preliminary';
    headline = 'Bugün Tarlaya Giriş Uygun Görünüyor';
    summary = 'Son 72 saatte belirgin ıslanma ve yakın sulama görünmüyor; toprak tipi ve eğim de otomatik ön taramada engel üretmedi.';
  } else if (automaticWeather || profile || irrigation.date) {
    status = 'caution';
    confidence = 'preliminary';
    headline = 'Bugün Tarlaya Girişte Dikkat';
    summary = 'Otomatik kanıtlar tam değil; Pusula “uygun” demek yerine temkinli giriş öneriyor.';
  }

  return {
    version: '21.1',
    fieldId,
    status,
    confidence,
    headline,
    summary,
    surfaceWater: {
      source: waterSource,
      volumetricWaterContent: round(waterValue),
      observedAt,
      ageHours: round(waterAgeHours, 1),
      fieldCapacityVol: round(profile?.fieldCapacityVol ?? null),
      ratioToFieldCapacity: round(ratioToFieldCapacity, 2),
      trafficabilityThresholdRatio: thresholdRatio,
      thresholdLabel: threshold?.label ?? null,
    },
    soil: {
      source: profile?.source ?? null,
      quality: profile?.quality ?? null,
      sandPercent: round(profile?.texture.sandPercent ?? null, 1),
      clayPercent: round(profile?.texture.clayPercent ?? null, 1),
      siltPercent: round(profile?.texture.siltPercent ?? null, 1),
    },
    wetting: {
      lastIrrigationDate: irrigation.date,
      hoursSinceIrrigation: round(irrigation.hours, 1),
      todayRainMm: round(rainMm, 1),
      todayRainChance: round(rainChance, 0),
      rainLast24hMm: round(rain24, 1),
      rainLast48hMm: round(rain48, 1),
      rainLast72hMm: round(rain72, 1),
      forecastNext12hMm: round(forecast12, 1),
      forecastNext12hMaxChance: round(forecastChance12, 0),
      automaticWeatherSource: automaticWeather ? 'open_meteo' : (rainMm != null || rainChance != null) ? 'home_weather' : 'missing',
    },
    terrain,
    evidence,
    guardrails: [
      'trafficability-screening-is-not-geotechnical-bearing-capacity-test',
      'open-meteo-soil-moisture-is-model-context-not-field-measurement',
      'manual-soil-moisture-measurement-is-optional-not-required',
      'soilgrids-texture-is-model-context-when-lab-texture-is-absent',
      'machinery-wheel-load-and-tyre-pressure-can-change-compaction-risk',
      'surface-workability-does-not-prove-subsoil-safety',
    ],
    generatedAt: now.toISOString(),
  };
}
