import { supabase } from '../../../supabaseClient';
import type {
  PlantingEscapeCalendar,
  PlantingWindowPhenologyStage,
  PlantingWindowScenario,
  PlantingWindowScenarioClimate,
  PlantingWindowStageExposure,
  WheatPlantingWindowResult,
} from '../types/plantingWindow';

const VERSION = '13.2' as const;
const SCENARIO_OFFSET_DAYS = 10;
const HISTORY_SEASONS = 10;
const DRY_DAY_RAIN_MM = 1;
const COLD_EXPOSURE_C = 0;
const HEAT_EXPOSURE_C = 30;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const resultCache = new Map<
  string,
  { expiresAt: number; value: WheatPlantingWindowResult }
>();

type DailyClimateRow = {
  tmin: number;
  tmax: number;
  rain: number;
};

type HistoricalClimate = {
  byDate: Map<string, DailyClimateRow>;
  startYear: number;
  endYear: number;
};

type SeasonRow = {
  crop?: unknown;
  planting_date?: unknown;
  harvest_date?: unknown;
};

type StageDefinition = {
  stage: PlantingWindowPhenologyStage;
  stageLabel: string;
  startRatio: number;
  endRatio: number;
};

/**
 * 13.5 sözleşmesi:
 * - Ekim tarihi gerçek field_seasons geçmişinden gelir.
 * - Fenoloji takvimi ancak gerçek ekim + hasat süresi varsa oluşturulur.
 * - Aşağıdaki oranlar buğday için PLANLAMA PENCERESİDİR; ölçülmüş fenoloji değildir.
 * - Don/ısı/kuru-seri değerleri ERA5-Land geçmiş meteorolojik maruziyetidir;
 *   zarar olasılığı veya verim tahmini değildir.
 */
const WHEAT_STAGE_WINDOWS: StageDefinition[] = [
  { stage: 'establishment', stageLabel: 'Çıkış / Yerleşme', startRatio: 0, endRatio: 0.15 },
  { stage: 'vegetative', stageLabel: 'Vejetatif Gelişim', startRatio: 0.15, endRatio: 0.45 },
  { stage: 'reproductive', stageLabel: 'Üreme / Çiçeklenme', startRatio: 0.45, endRatio: 0.65 },
  { stage: 'maturation', stageLabel: 'Olgunlaşma', startRatio: 0.65, endRatio: 0.85 },
  { stage: 'harvest_window', stageLabel: 'Hasat Penceresi', startRatio: 0.85, endRatio: 1 },
];

function text(value: unknown) {
  return String(value ?? '').trim();
}

function normalize(value: unknown) {
  return text(value)
    .toLocaleLowerCase('tr-TR')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/\s+/g, ' ');
}

function isWheat(value: unknown) {
  const crop = normalize(value);
  return (
    crop === 'bugday' ||
    crop === 'wheat' ||
    crop.includes('bugday') ||
    crop.includes('triticum')
  );
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validDate(value: unknown): string | null {
  const date = text(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return Number.isFinite(Date.parse(`${date}T00:00:00Z`)) ? date : null;
}

function addDays(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string) {
  return Math.round(
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
      86400000,
  );
}

function cropYearIndex(date: string) {
  const parsed = new Date(`${date}T00:00:00Z`);
  const calendarYear = parsed.getUTCFullYear();
  const cropYearStartYear = parsed.getUTCMonth() >= 6 ? calendarYear : calendarYear - 1;
  return Math.round(
    (parsed.getTime() - Date.parse(`${cropYearStartYear}-07-01T00:00:00Z`)) /
      86400000,
  );
}

function dateFromCropYearIndex(index: number, startYear: number) {
  const parsed = new Date(Date.UTC(startYear, 6, 1));
  parsed.setUTCDate(parsed.getUTCDate() + index);
  return parsed.toISOString().slice(0, 10);
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function medianNumber(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function mean(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round1(value: number | null) {
  return value == null ? null : Math.round(value * 10) / 10;
}

function nextOccurrenceFromCropIndex(index: number, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const currentYear = now.getUTCFullYear();
  const candidates = [currentYear - 1, currentYear, currentYear + 1, currentYear + 2]
    .map((year) => dateFromCropYearIndex(index, year))
    .filter((date) => date >= today)
    .sort();
  return candidates[0] ?? dateFromCropYearIndex(index, currentYear + 1);
}

function longestDrySpell(rows: DailyClimateRow[]) {
  let current = 0;
  let longest = 0;
  for (const row of rows) {
    if (row.rain < DRY_DAY_RAIN_MM) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

async function fetchHistoricalClimate(
  latitude: number,
  longitude: number,
): Promise<HistoricalClimate> {
  const endYear = new Date().getUTCFullYear() - 1;
  const startYear = endYear - HISTORY_SEASONS + 1;
  const url = new URL('https://archive-api.open-meteo.com/v1/archive');
  url.searchParams.set('latitude', String(latitude));
  url.searchParams.set('longitude', String(longitude));
  url.searchParams.set('start_date', `${startYear}-01-01`);
  // Kışlık ürün pencereleri sonraki takvim yılına taşabildiği için +1 yıl okunur.
  url.searchParams.set('end_date', `${endYear + 1}-12-31`);
  url.searchParams.set(
    'daily',
    'temperature_2m_min,temperature_2m_max,precipitation_sum',
  );
  url.searchParams.set('timezone', 'UTC');
  url.searchParams.set('models', 'era5_land');

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(url.toString(), { signal: controller.signal });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.daily) {
      throw new Error(`ERA5-Land geçmiş iklim serisi HTTP ${response.status}`);
    }

    const dates = Array.isArray(payload.daily.time)
      ? payload.daily.time.map(String)
      : [];
    const minValues = Array.isArray(payload.daily.temperature_2m_min)
      ? payload.daily.temperature_2m_min
      : [];
    const maxValues = Array.isArray(payload.daily.temperature_2m_max)
      ? payload.daily.temperature_2m_max
      : [];
    const rainValues = Array.isArray(payload.daily.precipitation_sum)
      ? payload.daily.precipitation_sum
      : [];
    const byDate = new Map<string, DailyClimateRow>();

    dates.forEach((date: string, index: number) => {
      const tmin = finite(minValues[index]);
      const tmax = finite(maxValues[index]);
      const rain = finite(rainValues[index]);
      if (
        tmin == null ||
        tmax == null ||
        rain == null ||
        tmax < tmin ||
        rain < 0
      ) {
        return;
      }
      byDate.set(date, { tmin, tmax, rain });
    });

    if (!byDate.size) {
      throw new Error('ERA5-Land geçmiş iklim serisi boş döndü.');
    }

    return { byDate, startYear, endYear };
  } finally {
    window.clearTimeout(timeout);
  }
}

function rowsForOffsetWindow(
  plantingDate: string,
  year: number,
  climate: HistoricalClimate,
  startOffsetDays: number,
  endOffsetDays: number,
) {
  const monthDay = plantingDate.slice(5, 10);
  const start = `${year}-${monthDay}`;
  if (!validDate(start)) return [];

  const rows: DailyClimateRow[] = [];
  for (let offset = startOffsetDays; offset <= endOffsetDays; offset += 1) {
    const row = climate.byDate.get(addDays(start, offset));
    if (!row) return [];
    rows.push(row);
  }
  return rows;
}

function stageOffsets(definition: StageDefinition, seasonDurationDays: number) {
  const maxOffset = Math.max(1, seasonDurationDays - 1);
  const start = Math.max(0, Math.round(maxOffset * definition.startRatio));
  const rawEnd = Math.round(maxOffset * definition.endRatio);
  const end = Math.max(start, Math.min(maxOffset, rawEnd));
  return { start, end };
}

function evaluateStage(
  plantingDate: string,
  climate: HistoricalClimate,
  definition: StageDefinition,
  seasonDurationDays: number,
): PlantingWindowStageExposure | null {
  const offsets = stageOffsets(definition, seasonDurationDays);
  const seasons: Array<{
    rain: number;
    cold: boolean;
    heat: boolean;
    drySpell: number;
  }> = [];

  for (let year = climate.startYear; year <= climate.endYear; year += 1) {
    const rows = rowsForOffsetWindow(
      plantingDate,
      year,
      climate,
      offsets.start,
      offsets.end,
    );
    if (rows.length !== offsets.end - offsets.start + 1) continue;

    seasons.push({
      rain: rows.reduce((sum, row) => sum + row.rain, 0),
      cold: rows.some((row) => row.tmin <= COLD_EXPOSURE_C),
      heat: rows.some((row) => row.tmax >= HEAT_EXPOSURE_C),
      drySpell: longestDrySpell(rows),
    });
  }

  if (!seasons.length) return null;

  return {
    stage: definition.stage,
    stageLabel: definition.stageLabel,
    evaluatedSeasons: seasons.length,
    meanStageDays: round1(offsets.end - offsets.start + 1),
    meanRainMm: round1(mean(seasons.map((item) => item.rain))),
    frostSeasonFrequencyPercent: Math.round(
      (seasons.filter((item) => item.cold).length / seasons.length) * 100,
    ),
    heatSeasonFrequencyPercent: Math.round(
      (seasons.filter((item) => item.heat).length / seasons.length) * 100,
    ),
    meanLongestDrySpellDays: round1(
      mean(seasons.map((item) => item.drySpell)),
    ),
    earliestEstimatedStartDate: addDays(plantingDate, offsets.start),
    latestEstimatedEndDate: addDays(plantingDate, offsets.end),
  };
}

function evaluateScenarioClimate(
  plantingDate: string,
  climate: HistoricalClimate,
  establishmentDays: number,
): PlantingWindowScenarioClimate | null {
  const days = Math.max(1, establishmentDays);
  const seasons: Array<{
    rain: number;
    meanMin: number;
    meanMax: number;
    cold: boolean;
    heat: boolean;
    drySpell: number;
  }> = [];

  for (let year = climate.startYear; year <= climate.endYear; year += 1) {
    const rows = rowsForOffsetWindow(plantingDate, year, climate, 0, days - 1);
    if (rows.length !== days) continue;

    seasons.push({
      rain: rows.reduce((sum, row) => sum + row.rain, 0),
      meanMin: mean(rows.map((row) => row.tmin)) ?? 0,
      meanMax: mean(rows.map((row) => row.tmax)) ?? 0,
      cold: rows.some((row) => row.tmin <= COLD_EXPOSURE_C),
      heat: rows.some((row) => row.tmax >= HEAT_EXPOSURE_C),
      drySpell: longestDrySpell(rows),
    });
  }

  if (!seasons.length) return null;

  return {
    evaluatedSeasons: seasons.length,
    establishmentDays: days,
    meanRainMm: round1(mean(seasons.map((item) => item.rain))),
    medianRainMm: round1(medianNumber(seasons.map((item) => item.rain))),
    meanMinTempC: round1(mean(seasons.map((item) => item.meanMin))),
    meanMaxTempC: round1(mean(seasons.map((item) => item.meanMax))),
    frostSeasonFrequencyPercent: Math.round(
      (seasons.filter((item) => item.cold).length / seasons.length) * 100,
    ),
    heatSeasonFrequencyPercent: Math.round(
      (seasons.filter((item) => item.heat).length / seasons.length) * 100,
    ),
    meanLongestDrySpellDays: round1(
      mean(seasons.map((item) => item.drySpell)),
    ),
  };
}

function buildEscapeCalendar(
  plantingDate: string,
  climate: HistoricalClimate | null,
  seasonDurationDays: number | null,
  durationSource: PlantingEscapeCalendar['durationSource'],
  historicalDurationCount: number,
): PlantingEscapeCalendar {
  if (!climate || seasonDurationDays == null) {
    return {
      status: 'needs_data',
      seasonDurationDays,
      durationSource,
      historicalDurationCount,
      stages: [],
      criticalStage: null,
      evidence: [
        !climate
          ? 'Geçmiş yerel iklim serisi olmadan kritik evre maruziyeti karşılaştırılmadı.'
          : 'Gerçek ekim + hasat süresi olmadan fenoloji evreleri tahmin edilmedi.',
      ],
    };
  }

  const stages = WHEAT_STAGE_WINDOWS
    .map((definition) =>
      evaluateStage(plantingDate, climate, definition, seasonDurationDays),
    )
    .filter((value): value is PlantingWindowStageExposure => Boolean(value));

  const reproductive =
    stages.find((item) => item.stage === 'reproductive') ?? null;

  return {
    status: stages.length === WHEAT_STAGE_WINDOWS.length ? 'ready' : 'needs_data',
    seasonDurationDays,
    durationSource,
    historicalDurationCount,
    stages,
    criticalStage: reproductive,
    evidence: [
      `${historicalDurationCount} gerçek tamamlanmış sezon kaydından ${seasonDurationDays} günlük sezon ölçeği kullanıldı.`,
      `${climate.startYear}-${climate.endYear} ERA5-Land günlük serisiyle evre bazlı don, sıcaklık ve kuru-seri maruziyeti karşılaştırıldı.`,
      'Evre tarihleri planlama tahminidir; ölçülmüş fenoloji veya zarar/verim tahmini değildir.',
    ],
  };
}

function scenarioEvidence(
  climate: PlantingWindowScenarioClimate | null,
  calendar: PlantingEscapeCalendar,
) {
  const rows = [...calendar.evidence];
  if (climate) {
    rows.unshift(
      `Ekim sonrası ilk ${climate.establishmentDays} günde ortalama yağış ${climate.meanRainMm ?? '—'} mm; ortalama en uzun kuru seri ${climate.meanLongestDrySpellDays ?? '—'} gün.`,
    );
  }
  return rows;
}

function baseResult(
  fieldId: string,
  crop: string | null,
  status: WheatPlantingWindowResult['status'],
  missingInputs: string[],
  note: string,
): WheatPlantingWindowResult {
  return {
    version: VERSION,
    fieldId,
    crop,
    supported: status !== 'unsupported',
    status,
    anchor: {
      date: null,
      source: 'none',
      historicalPlantingCount: 0,
    },
    seasonDuration: {
      days: null,
      source: 'none',
      historicalDurationCount: 0,
    },
    scenarios: [],
    guardrails: {
      scenarioNotRecommendation: true,
      realPlantingRecordNeverOverwritten: true,
      noSyntheticVariety: true,
      weatherExposureNotDiseaseDiagnosis: true,
      stageExposureIsPlanningEstimate: true,
      stageExposureNotYieldLossPrediction: true,
      noStageEstimateWithoutRealSeasonDuration: true,
    },
    missingInputs,
    generatedAt: new Date().toISOString(),
    note,
  };
}

function completedSeasonDurations(rows: SeasonRow[], fallbackCrop: string | null) {
  return rows
    .filter((row) => isWheat(row.crop ?? fallbackCrop))
    .map((row) => {
      const planting = validDate(row.planting_date);
      const harvest = validDate(row.harvest_date);
      if (!planting || !harvest) return null;
      const duration = daysBetween(planting, harvest);
      // Yalnız ters/bozuk tarihleri ele. Tarla kaydından yeni süre uydurulmaz.
      return duration > 0 && duration <= 500 ? duration : null;
    })
    .filter((value): value is number => value != null);
}

export async function fetchWheatPlantingWindowScenarios(
  fieldId: string | number,
  options: { forceRefresh?: boolean } = {},
): Promise<WheatPlantingWindowResult> {
  const id = text(fieldId);
  if (!id) throw new Error('Ekim penceresi için tarla kimliği bulunamadı.');
  if (!supabase) throw new Error('Ekim penceresi servisine bağlanılamadı.');

  const cached = resultCache.get(id);
  if (!options.forceRefresh && cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const user = authData.user;
  if (!user) throw new Error('Ekim penceresi için geçerli kullanıcı oturumu gerekli.');

  const { data: field, error: fieldError } = await supabase
    .from('fields')
    .select('id,crop,latitude,longitude,parcel_centroid_lat,parcel_centroid_lng')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (fieldError) throw fieldError;
  if (!field) throw new Error('Tarla bulunamadı veya bu kullanıcıya ait değil.');

  const crop = text(field.crop) || null;
  if (!isWheat(crop)) {
    return baseResult(
      id,
      crop,
      'unsupported',
      [],
      '13.2 ilk pilot yalnız buğday için açıktır.',
    );
  }

  const latitude = finite(field.parcel_centroid_lat ?? field.latitude);
  const longitude = finite(field.parcel_centroid_lng ?? field.longitude);
  if (latitude == null || longitude == null) {
    return baseResult(
      id,
      crop,
      'needs_data',
      ['field_location'],
      'Tarla konumu olmadan yerel geçmiş iklim karşılaştırması yapılmaz.',
    );
  }

  const { data: seasons, error: seasonError } = await supabase
    .from('field_seasons')
    .select('id,year,crop,planting_date,harvest_date,variety_name')
    .eq('user_id', user.id)
    .eq('field_id', id)
    .not('planting_date', 'is', null)
    .order('year', { ascending: false })
    .limit(20);

  if (seasonError) throw seasonError;

  const seasonRows = (seasons ?? []) as SeasonRow[];
  const plantingDates = seasonRows
    .filter((row) => isWheat(row.crop ?? crop))
    .map((row) => validDate(row.planting_date))
    .filter((date): date is string => Boolean(date));

  if (!plantingDates.length) {
    return baseResult(
      id,
      crop,
      'needs_data',
      ['planting_history_or_verified_crop_calendar'],
      'Gerçek ekim geçmişi veya doğrulanmış yerel ürün takvimi olmadan tarih uydurulmadı.',
    );
  }

  const durations = completedSeasonDurations(seasonRows, crop);
  if (!durations.length) {
    const result = baseResult(
      id,
      crop,
      'needs_data',
      ['real_planting_harvest_duration'],
      'Kritik evre takvimi için aynı gerçek sezonda ekim ve hasat tarihi gerekir; süre uydurulmadı.',
    );
    result.anchor = {
      date: nextOccurrenceFromCropIndex(median(plantingDates.map(cropYearIndex)) ?? cropYearIndex(plantingDates[0])),
      source: plantingDates.length >= 2 ? 'field_history_median' : 'latest_real_planting',
      historicalPlantingCount: plantingDates.length,
    };
    return result;
  }

  const medianIndex = median(plantingDates.map(cropYearIndex));
  const durationDays = median(durations);
  if (medianIndex == null || durationDays == null) {
    return baseResult(
      id,
      crop,
      'needs_data',
      ['planting_history_or_verified_crop_calendar', 'real_planting_harvest_duration'],
      'Gerçek sezon geçmişinden güvenli tarih/süre referansı çıkarılamadı.',
    );
  }

  const anchorDate = nextOccurrenceFromCropIndex(medianIndex);
  const anchorSource = plantingDates.length >= 2
    ? ('field_history_median' as const)
    : ('latest_real_planting' as const);
  const durationSource = durations.length >= 2
    ? ('field_history_median' as const)
    : ('latest_complete_season' as const);

  let historicalClimate: HistoricalClimate | null = null;
  try {
    historicalClimate = await fetchHistoricalClimate(latitude, longitude);
  } catch (error) {
    console.warn(
      '[TarlaPusula] 13.2 geçmiş iklim karşılaştırması alınamadı:',
      error,
    );
  }

  const definitions = [
    { key: 'early' as const, label: 'Erken senaryo', offsetDays: -SCENARIO_OFFSET_DAYS },
    { key: 'anchor' as const, label: 'Referans senaryo', offsetDays: 0 },
    { key: 'late' as const, label: 'Geç senaryo', offsetDays: SCENARIO_OFFSET_DAYS },
  ];

  const establishmentDefinition = WHEAT_STAGE_WINDOWS[0];
  const establishmentOffsets = stageOffsets(establishmentDefinition, durationDays);
  const establishmentDays = establishmentOffsets.end - establishmentOffsets.start + 1;

  const scenarios: PlantingWindowScenario[] = definitions.map((definition) => {
    const plantingDate = addDays(anchorDate, definition.offsetDays);
    const climate = historicalClimate
      ? evaluateScenarioClimate(plantingDate, historicalClimate, establishmentDays)
      : null;
    const escapeCalendar = buildEscapeCalendar(
      plantingDate,
      historicalClimate,
      durationDays,
      durationSource,
      durations.length,
    );

    return {
      ...definition,
      plantingDate,
      climate,
      escapeCalendar,
      evidence: scenarioEvidence(climate, escapeCalendar),
    };
  });

  const missingInputs = historicalClimate ? [] : ['historical_climate'];
  const allReady = scenarios.every(
    (scenario) =>
      scenario.climate !== null && scenario.escapeCalendar.status === 'ready',
  );

  const result: WheatPlantingWindowResult = {
    version: VERSION,
    fieldId: id,
    crop,
    supported: true,
    status: allReady ? 'ready' : 'needs_data',
    anchor: {
      date: anchorDate,
      source: anchorSource,
      historicalPlantingCount: plantingDates.length,
    },
    seasonDuration: {
      days: durationDays,
      source: durationSource,
      historicalDurationCount: durations.length,
    },
    scenarios,
    guardrails: {
      scenarioNotRecommendation: true,
      realPlantingRecordNeverOverwritten: true,
      noSyntheticVariety: true,
      weatherExposureNotDiseaseDiagnosis: true,
      stageExposureIsPlanningEstimate: true,
      stageExposureNotYieldLossPrediction: true,
      noStageEstimateWithoutRealSeasonDuration: true,
    },
    missingInputs,
    generatedAt: new Date().toISOString(),
    note:
      '13.2/13.5 tehlikeden kaçış karşılaştırmasıdır. Üç ekim tarihi gerçek tarla ekim geçmişinden, fenoloji ölçeği yalnız gerçek ekim+hasat sürelerinden türetilir. ERA5-Land geçmiş meteorolojik maruziyeti karşılaştırır. “Daha düşük maruziyet” otomatik ekim tavsiyesi, risk olasılığı, zarar veya verim tahmini değildir.',
  };

  resultCache.set(id, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value: result,
  });

  return result;
}
