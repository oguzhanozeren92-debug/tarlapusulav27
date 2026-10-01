import { supabase } from '../../../supabaseClient';
import type { IrrigationDecisionResult } from '../../irrigation/types/irrigationDecision';
import { buildFieldPhenology } from '../../phenology/services/buildFieldPhenology';
import type { PhenologyResult, PhenologyStage } from '../../phenology/types/phenology';
import type {
  FieldWaterBudget,
  SaveFieldWaterBudgetInput,
  WaterScarcityConfidence,
  WaterScarcityPlanSnapshot,
  WaterSensitivity,
  WaterSourceType,
} from '../types/waterScarcity';

const FIVE_DAYS = 5;

function text(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value: number | null, digits = 2) {
  if (value === null || !Number.isFinite(value)) return null;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function dateOnly(value: unknown): string | null {
  const raw = text(value);
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) return null;
  const parsed = Date.parse(`${match[1]}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10) === match[1] ? match[1] : null;
}

function isoToday(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeUnit(value: unknown) {
  return text(value)
    .toLocaleLowerCase('tr-TR')
    .replace(/³/g, '3')
    .replace(/\s+/g, '');
}

function irrigationVolumeM3(
  quantity: unknown,
  unit: unknown,
  notes: unknown,
  areaDecare: number | null,
) {
  const q = finite(quantity);
  const normalizedUnit = normalizeUnit(unit);

  if (q !== null && q >= 0) {
    if (['m3', 'metrekup', 'metreküp'].includes(normalizedUnit)) return q;
    if (['l', 'lt', 'litre', 'liter'].includes(normalizedUnit)) return q / 1000;
    if (['m3/da', 'mm'].includes(normalizedUnit) && areaDecare !== null && areaDecare > 0) {
      // 1 mm su × 1 dekar = 1 m³.
      return q * areaDecare;
    }
  }

  const raw = text(notes).replace(',', '.');
  const perDa = raw.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:m3|m³)\s*\/\s*da/i);
  if (perDa && areaDecare !== null && areaDecare > 0) {
    return Number(perDa[1]) * areaDecare;
  }

  const total = raw.match(/(?:toplam\s*)?([0-9]+(?:\.[0-9]+)?)\s*(?:m3|m³)\b/i);
  return total ? Number(total[1]) : null;
}

function normalizeSourceType(value: unknown): WaterSourceType {
  const raw = text(value) as WaterSourceType;
  return ['well', 'canal', 'reservoir', 'tank', 'allocation', 'other'].includes(raw)
    ? raw
    : 'other';
}

function mapBudget(row: any): FieldWaterBudget {
  return {
    id: row?.id ? String(row.id) : null,
    fieldId: String(row?.field_id ?? ''),
    periodStart: String(row?.period_start ?? ''),
    periodEnd: String(row?.period_end ?? ''),
    availableWaterM3: Math.max(0, finite(row?.available_water_m3) ?? 0),
    sourceLabel: text(row?.source_label) || null,
    sourceType: normalizeSourceType(row?.source_type),
    maxDailyWaterM3: finite(row?.max_daily_water_m3),
    notes: text(row?.notes) || null,
    verifiedAt: row?.verified_at ? String(row.verified_at) : null,
    updatedAt: row?.updated_at ? String(row.updated_at) : null,
  };
}

export function waterSensitivityForStage(stageInput: unknown): WaterSensitivity {
  const stage = text(stageInput) as PhenologyStage;

  if (['establishment', 'reproductive', 'flowering', 'fruit_set'].includes(stage)) {
    return 'high';
  }

  if (
    [
      'vegetative',
      'maturation',
      'bud_swell',
      'bud_break',
      'fruit_growth',
      'veraison',
    ].includes(stage)
  ) {
    return 'medium';
  }

  if (['pre_sowing', 'harvest_window', 'post_harvest', 'dormancy', 'leaf_fall'].includes(stage)) {
    return 'low';
  }

  return 'unknown';
}

async function loadActiveBudget(fieldId: string, now = new Date()): Promise<FieldWaterBudget | null> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) return null;

  const today = isoToday(now);
  const { data, error } = await supabase
    .from('field_water_budgets')
    .select('id,field_id,period_start,period_end,available_water_m3,source_label,source_type,max_daily_water_m3,notes,verified_at,updated_at')
    .eq('user_id', auth.user.id)
    .eq('field_id', fieldId)
    .lte('period_start', today)
    .gte('period_end', today)
    .order('period_start', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (error.code === '42P01') return null;
    throw error;
  }

  return data ? mapBudget(data) : null;
}

async function loadFieldFacts(fieldId: string) {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) {
    return {
      areaDecare: null as number | null,
      latitude: null as number | null,
      longitude: null as number | null,
      field: null as any,
    };
  }

  const { data, error } = await supabase
    .from('fields')
    .select('id,crop,crop_cycle,season,planting_year,bearing,area_decare,latitude,longitude,parcel_centroid_lat,parcel_centroid_lng')
    .eq('id', fieldId)
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (error) throw error;

  return {
    areaDecare: finite(data?.area_decare),
    latitude: finite(data?.parcel_centroid_lat ?? data?.latitude),
    longitude: finite(data?.parcel_centroid_lng ?? data?.longitude),
    field: data ?? null,
  };
}

async function loadEfficiency(fieldId: string) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data, error } = await supabase
    .from('field_irrigation_economics')
    .select('irrigation_efficiency_pct')
    .eq('user_id', auth.user.id)
    .eq('field_id', fieldId)
    .maybeSingle();

  if (error) {
    if (error.code === '42P01') return null;
    throw error;
  }

  const value = finite(data?.irrigation_efficiency_pct);
  return value !== null && value > 0 && value <= 100 ? value : null;
}

async function loadBudgetUsage(fieldId: string, budget: FieldWaterBudget, areaDecare: number | null, now = new Date()) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return {
      recordedUseM3: null as number | null,
      unquantifiedIrrigationCount: 0,
      irrigationRecordCount: 0,
    };
  }

  const { data, error } = await supabase
    .from('activities')
    .select('quantity,unit,notes,activity_date')
    .eq('user_id', auth.user.id)
    .eq('field_id', fieldId)
    .ilike('activity_type', 'sulama')
    .gte('activity_date', budget.periodStart)
    .lte('activity_date', budget.periodEnd < isoToday(now) ? budget.periodEnd : isoToday(now))
    .order('activity_date', { ascending: true })
    .limit(250);

  if (error) throw error;

  let total = 0;
  let quantified = 0;
  let unquantified = 0;

  for (const row of data ?? []) {
    const volume = irrigationVolumeM3(row.quantity, row.unit, row.notes, areaDecare);
    if (volume === null) {
      unquantified += 1;
    } else {
      total += volume;
      quantified += 1;
    }
  }

  return {
    recordedUseM3: quantified > 0 ? round(total) : data?.length ? 0 : 0,
    unquantifiedIrrigationCount: unquantified,
    irrigationRecordCount: data?.length ?? 0,
  };
}

async function loadDatabasePhenology(fieldId: string, field: any): Promise<PhenologyResult | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user || !field) return null;

  let seasonQuery = supabase
    .from('field_seasons')
    .select('crop,variety_name,planting_date,harvest_date,year')
    .eq('user_id', auth.user.id)
    .eq('field_id', fieldId)
    .order('year', { ascending: false })
    .limit(1);

  if (Number.isInteger(Number(field.season))) {
    seasonQuery = seasonQuery.eq('year', Number(field.season));
  }

  const { data: season, error } = await seasonQuery.maybeSingle();
  if (error) return null;

  return buildFieldPhenology({
    crop: season?.crop ?? field.crop ?? null,
    cropCycle: field.crop_cycle ?? null,
    plantingDate: season?.planting_date ?? null,
    actualHarvestDate: season?.harvest_date ?? null,
  });
}

async function loadHeatContext(latitude: number | null, longitude: number | null) {
  if (latitude === null || longitude === null) {
    return { maxTemperatureC: null as number | null, hotDayCount: null as number | null };
  }

  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(latitude));
    url.searchParams.set('longitude', String(longitude));
    url.searchParams.set('daily', 'temperature_2m_max');
    url.searchParams.set('forecast_days', String(FIVE_DAYS));
    url.searchParams.set('timezone', 'auto');

    const response = await fetch(url.toString());
    const payload = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(payload?.daily?.temperature_2m_max)) {
      return { maxTemperatureC: null, hotDayCount: null };
    }

    const values = payload.daily.temperature_2m_max
      .map(finite)
      .filter((value: number | null): value is number => value !== null);

    if (!values.length) return { maxTemperatureC: null, hotDayCount: null };

    return {
      maxTemperatureC: round(Math.max(...values), 1),
      // 35 °C burada ürün-hasar eşiği değildir; yalnız yüksek ısı yükü bağlamıdır.
      hotDayCount: values.filter((value) => value >= 35).length,
    };
  } catch {
    return { maxTemperatureC: null, hotDayCount: null };
  }
}

function forecastClimate(irrigationDecision: IrrigationDecisionResult | null) {
  const days = Array.isArray(irrigationDecision?.forecast)
    ? irrigationDecision!.forecast.slice(0, FIVE_DAYS)
    : [];

  if (!days.length) {
    return {
      cropWaterUseMm: null as number | null,
      effectiveRainMm: null as number | null,
      climatePressureMm: null as number | null,
    };
  }

  let cropUse = 0;
  let effectiveRain = 0;
  for (const day of days) {
    const use = finite(day.estimatedCropWaterUseMm);
    const rain = finite(day.effectiveRainMm);
    if (use === null || rain === null) {
      return { cropWaterUseMm: null, effectiveRainMm: null, climatePressureMm: null };
    }
    cropUse += use;
    effectiveRain += rain;
  }

  return {
    cropWaterUseMm: round(cropUse),
    effectiveRainMm: round(effectiveRain),
    climatePressureMm: round(Math.max(0, cropUse - effectiveRain)),
  };
}

function planConfidence(input: {
  budget: FieldWaterBudget | null;
  irrigationDecision: IrrigationDecisionResult | null;
  efficiencyPct: number | null;
  phenologyConfidence: string | null;
  unquantifiedIrrigationCount: number;
  physicalCoverageRatio: number | null;
}): WaterScarcityConfidence {
  if (!input.irrigationDecision) return 'low';
  if (!input.budget) return input.phenologyConfidence === 'high' ? 'medium' : 'low';
  if (input.unquantifiedIrrigationCount > 0) return 'low';
  if (input.physicalCoverageRatio !== null && input.efficiencyPct !== null) {
    return input.phenologyConfidence === 'low' ? 'medium' : 'high';
  }
  return 'medium';
}

function buildPlanState(input: {
  irrigationStatus: string | null;
  decisionCode: string | null;
  sensitivity: WaterSensitivity;
  budget: FieldWaterBudget | null;
  planningNetNeedM3: number | null;
  efficiencyPct: number | null;
  physicalCoverageRatio: number | null;
}) {
  if (input.irrigationStatus === 'rainfed') return 'not_applicable' as const;
  if (!input.irrigationStatus || !input.decisionCode || input.decisionCode === 'needs_data') {
    return 'needs_data' as const;
  }

  const irrigationPressure =
    input.decisionCode === 'irrigate_now' || input.decisionCode === 'irrigation_approaching';

  if (!input.budget) {
    if (input.sensitivity === 'high' && irrigationPressure) return 'protect_water' as const;
    return 'needs_data' as const;
  }

  if (input.planningNetNeedM3 === null || input.planningNetNeedM3 <= 0) {
    return 'normal' as const;
  }

  if (input.efficiencyPct === null || input.physicalCoverageRatio === null) {
    if (input.sensitivity === 'high' && irrigationPressure) return 'protect_water' as const;
    return 'needs_data' as const;
  }

  const coverage = input.physicalCoverageRatio;

  if (input.sensitivity === 'high') {
    if (coverage < 1) return 'scarcity_plan' as const;
    return irrigationPressure ? 'protect_water' as const : 'normal' as const;
  }

  if (input.sensitivity === 'medium') {
    if (coverage < 0.70) return 'scarcity_plan' as const;
    if (coverage < 1) return 'controlled_reduce' as const;
    return 'normal' as const;
  }

  if (input.sensitivity === 'low') {
    if (coverage < 0.50) return 'scarcity_plan' as const;
    if (coverage < 1) return 'controlled_reduce' as const;
    return 'normal' as const;
  }

  if (coverage < 1) return 'scarcity_plan' as const;
  return 'normal' as const;
}

function buildDisplay(input: {
  state: WaterScarcityPlanSnapshot['state'];
  sensitivity: WaterSensitivity;
  stageLabel: string | null;
  physicalCoverageRatio: number | null;
  remainingWaterM3: number | null;
  grossNeedM3: number | null;
  missing: string[];
}) {
  const stage = input.stageLabel ? ` · ${input.stageLabel}` : '';
  const coverageLabel = input.physicalCoverageRatio !== null
    ? `%${Math.round(clamp(input.physicalCoverageRatio, 0, 9.99) * 100)}`
    : null;

  if (input.state === 'not_applicable') {
    return {
      headline: 'Su Kıtlığı Planı uygulanmıyor',
      summary: 'Tarla susuz/kuru üretim olarak kayıtlı. Bu özellik sulama suyu bütçesi dağıtmaz.',
      action: 'Yağış ve su stresi takibini Sulama Motoru üzerinden sürdür.',
    };
  }

  if (input.state === 'needs_data') {
    return {
      headline: 'Su bütçesini tanımla',
      summary: input.missing.length
        ? `Su Kıtlığı Planı gerçek kullanılabilir suyu bilmeden devreye girmez. Eksik: ${input.missing.join(', ')}.`
        : 'Su Kıtlığı Planı için gerçek kullanılabilir su hacmini kaydet.',
      action: 'Sulama detayında kullanılabilir su miktarını ve dönemini gir.',
    };
  }

  if (input.state === 'protect_water') {
    return {
      headline: 'Suyu Koru',
      summary: `Bitki suya hassas bir evrede${stage}; mevcut sulama ihtiyacını bu dönemde gelişigüzel kısmak uygun değil.`,
      action: 'Mevcut suyu kritik döneme önceliklendir; su azaltımını daha toleranslı döneme kaydır.',
    };
  }

  if (input.state === 'controlled_reduce') {
    return {
      headline: 'Kontrollü Azalt',
      summary: coverageLabel
        ? `Kayıtlı su bütçesi mevcut planlanan ihtiyacın yaklaşık ${coverageLabel} kadarını fiziksel olarak karşılıyor${stage}. Bu oran optimum eksik sulama dozu değildir.`
        : `Su bütçesi tam ihtiyacı karşılamıyor${stage}; evre kritik olmadığı için kontrollü azaltım değerlendirilebilir.`,
      action: 'Mevcut suyu tek seferde tüketme; tam ihtiyacın karşılanamadığını dikkate al ve saha tepkisini izle.',
    };
  }

  if (input.state === 'scarcity_plan') {
    return {
      headline: 'Su Kıtlığı Planı',
      summary: coverageLabel
        ? `Kalan su, planlanan sulama ihtiyacının yaklaşık ${coverageLabel} kadarını karşılıyor. Normal sulama planı mevcut kaynakla tamamlanamıyor.`
        : 'Kayıtlı su bütçesi normal sulama ihtiyacını karşılamıyor.',
      action: input.sensitivity === 'high'
        ? 'Bu kritik evrede suyu bu tarlada koru; daha toleranslı dönem/alanlardaki sulamayı ertele veya azalt.'
        : 'Kalan suyu kritik fenoloji dönemlerine sakla; toleranslı dönemlerdeki sulamayı kontrollü azalt.',
    };
  }

  return {
    headline: 'Normal',
    summary: input.remainingWaterM3 !== null && input.grossNeedM3 !== null
      ? `Kayıtlı su bütçesi mevcut planlanan sulama ihtiyacını karşılıyor. Kalan kaynak yaklaşık ${input.remainingWaterM3.toFixed(0)} m³.`
      : 'Mevcut kayıtlarla Su Kıtlığı Planı gerektiren bir açık görünmüyor.',
    action: 'Production Sulama Motoru kararını normal şekilde uygula; su bütçesini güncel tut.',
  };
}

export async function loadWaterScarcityPlanSnapshot(input: {
  fieldId: string;
  irrigationDecision: IrrigationDecisionResult | null;
  phenology?: Pick<PhenologyResult, 'stage' | 'stageLabel' | 'confidence' | 'dataStatus'> | null;
  now?: Date;
}): Promise<WaterScarcityPlanSnapshot> {
  const fieldId = text(input.fieldId);
  if (!fieldId) throw new Error('Su Kıtlığı Planı için tarla seçilemedi.');

  const now = input.now ?? new Date();
  const generatedAt = now.toISOString();
  const [budget, fieldFacts, efficiencyPct] = await Promise.all([
    loadActiveBudget(fieldId, now),
    loadFieldFacts(fieldId),
    loadEfficiency(fieldId),
  ]);

  const phenology = input.phenology ?? await loadDatabasePhenology(fieldId, fieldFacts.field).catch(() => null);
  const sensitivity = waterSensitivityForStage(phenology?.stage);
  const climateForecast = forecastClimate(input.irrigationDecision);
  const irrigationPressure = input.irrigationDecision?.decision === 'irrigate_now' || input.irrigationDecision?.decision === 'irrigation_approaching';
  const heat = budget || irrigationPressure
    ? await loadHeatContext(fieldFacts.latitude, fieldFacts.longitude)
    : { maxTemperatureC: null as number | null, hotDayCount: null as number | null };

  const usage = budget
    ? await loadBudgetUsage(fieldId, budget, fieldFacts.areaDecare, now)
    : { recordedUseM3: null, unquantifiedIrrigationCount: 0, irrigationRecordCount: 0 };

  const remainingWaterM3 = budget && usage.unquantifiedIrrigationCount === 0
    ? Math.max(0, budget.availableWaterM3 - (usage.recordedUseM3 ?? 0))
    : null;

  const immediateNetNeedM3 = finite(input.irrigationDecision?.recommendation?.totalNetWaterM3);
  const projected5DayDeficitMm = finite(input.irrigationDecision?.waterBalance?.projected5DayDeficitMm);
  const projected5DayNetM3 =
    projected5DayDeficitMm !== null && fieldFacts.areaDecare !== null && fieldFacts.areaDecare > 0
      ? projected5DayDeficitMm * fieldFacts.areaDecare
      : null;

  const decisionCode = input.irrigationDecision?.decision ?? null;
  const planningNetNeedM3 = immediateNetNeedM3 !== null && immediateNetNeedM3 > 0
    ? immediateNetNeedM3
    : (decisionCode === 'irrigation_approaching' && projected5DayNetM3 !== null
        ? projected5DayNetM3
        : null);

  const efficiency = efficiencyPct !== null ? efficiencyPct / 100 : null;
  const grossNeedM3 = planningNetNeedM3 !== null && efficiency !== null && efficiency > 0
    ? planningNetNeedM3 / efficiency
    : null;

  const coverageRatio = grossNeedM3 !== null && grossNeedM3 > 0 && remainingWaterM3 !== null
    ? remainingWaterM3 / grossNeedM3
    : null;
  const capacityWindowDays = decisionCode === 'irrigation_approaching' ? FIVE_DAYS : 1;
  const dailyCapacityRatio = grossNeedM3 !== null && grossNeedM3 > 0 && budget?.maxDailyWaterM3 != null
    ? (budget.maxDailyWaterM3 * capacityWindowDays) / grossNeedM3
    : null;
  const physicalCoverageRatio = coverageRatio !== null
    ? Math.min(coverageRatio, dailyCapacityRatio ?? Number.POSITIVE_INFINITY)
    : null;

  const missing: string[] = [];
  if (input.irrigationDecision?.irrigationStatus !== 'rainfed') {
    if (!input.irrigationDecision || input.irrigationDecision.decision === 'needs_data') missing.push('Production Sulama Motoru kararı');
    if (!budget) missing.push('kullanılabilir su bütçesi');
    if (budget && planningNetNeedM3 !== null && efficiencyPct === null) missing.push('sulama randımanı');
    if (planningNetNeedM3 !== null && fieldFacts.areaDecare === null) missing.push('tarla alanı');
    if (!phenology || phenology.dataStatus !== 'usable') missing.push('güncel fenoloji evresi');
  }

  if (usage.unquantifiedIrrigationCount > 0) {
    missing.push(`${usage.unquantifiedIrrigationCount} sulama kaydında ölçülebilir su hacmi`);
  }

  const state = buildPlanState({
    irrigationStatus: input.irrigationDecision?.irrigationStatus ?? null,
    decisionCode,
    sensitivity,
    budget,
    planningNetNeedM3,
    efficiencyPct,
    physicalCoverageRatio,
  });

  const confidence = planConfidence({
    budget,
    irrigationDecision: input.irrigationDecision,
    efficiencyPct,
    phenologyConfidence: phenology?.confidence ?? null,
    unquantifiedIrrigationCount: usage.unquantifiedIrrigationCount,
    physicalCoverageRatio,
  });

  const display = buildDisplay({
    state,
    sensitivity,
    stageLabel: phenology?.stageLabel ?? null,
    physicalCoverageRatio,
    remainingWaterM3,
    grossNeedM3,
    missing,
  });

  const evidence = [
    budget
      ? `Kayıtlı su bütçesi: ${budget.availableWaterM3.toFixed(0)} m³ · ${budget.periodStart}–${budget.periodEnd}.`
      : 'Kullanılabilir su bütçesi kayıtlı değil.',
    remainingWaterM3 !== null
      ? `Kayıtlı sulamalar düşüldükten sonra hesaplanan kalan kaynak: ${remainingWaterM3.toFixed(0)} m³.`
      : '',
    usage.unquantifiedIrrigationCount > 0
      ? `${usage.unquantifiedIrrigationCount} sulama kaydında m³/mm karşılığı bulunamadığı için kalan su hesabı eksik olabilir.`
      : '',
    planningNetNeedM3 !== null
      ? `Production Sulama Motoru planlama ihtiyacı: yaklaşık ${planningNetNeedM3.toFixed(0)} m³ NET.`
      : 'Production Sulama Motoru şu an sayısal NET su ihtiyacı vermiyor.',
    grossNeedM3 !== null
      ? `Kayıtlı %${efficiencyPct?.toFixed(0)} sulama randımanıyla kaynakta gereken brüt su: yaklaşık ${grossNeedM3.toFixed(0)} m³.`
      : '',
    budget?.maxDailyWaterM3 != null && grossNeedM3 !== null
      ? `Kaynak kapasitesi: ${budget.maxDailyWaterM3.toFixed(0)} m³/gün · ${capacityWindowDays} günlük planlama penceresinde yaklaşık ${(budget.maxDailyWaterM3 * capacityWindowDays).toFixed(0)} m³.`
      : '',
    phenology?.stageLabel
      ? `Fenoloji: ${phenology.stageLabel} · su hassasiyeti sınıfı ${sensitivity}.`
      : 'Fenoloji evresi çözülemedi.',
    climateForecast.climatePressureMm !== null
      ? `Önümüzdeki 5 günlük ETc − etkili yağış baskısı: ${climateForecast.climatePressureMm.toFixed(1)} mm.`
      : '',
    heat.maxTemperatureC !== null
      ? `Önümüzdeki 5 gün tahmini en yüksek sıcaklık: ${heat.maxTemperatureC.toFixed(1)} °C${heat.hotDayCount ? ` · ${heat.hotDayCount} gün ≥35 °C ısı yükü bağlamı` : ''}.`
      : '',
  ].filter(Boolean);

  return {
    version: '23.0',
    fieldId,
    state,
    confidence,
    generatedAt,
    budget: {
      profile: budget,
      recordedUseM3: round(usage.recordedUseM3),
      remainingWaterM3: round(remainingWaterM3),
      unquantifiedIrrigationCount: usage.unquantifiedIrrigationCount,
      irrigationRecordCount: usage.irrigationRecordCount,
    },
    irrigation: {
      decisionCode,
      irrigationStatus: input.irrigationDecision?.irrigationStatus ?? null,
      netWaterMm: finite(input.irrigationDecision?.recommendation?.netWaterMm),
      currentNetNeedM3: round(immediateNetNeedM3),
      planningNetNeedM3: round(planningNetNeedM3),
      grossNeedM3: round(grossNeedM3),
      irrigationEfficiencyPct: efficiencyPct,
      projected5DayDeficitMm: projected5DayDeficitMm,
      coverageRatio: round(coverageRatio, 3),
      dailyCapacityRatio: round(dailyCapacityRatio, 3),
      physicalCoverageRatio: round(physicalCoverageRatio, 3),
    },
    phenology: {
      stage: phenology?.stage ?? null,
      stageLabel: phenology?.stageLabel ?? null,
      sensitivity,
      confidence: phenology?.confidence ?? null,
    },
    climate: {
      forecast5DayCropWaterUseMm: climateForecast.cropWaterUseMm,
      forecast5DayEffectiveRainMm: climateForecast.effectiveRainMm,
      forecast5DayClimatePressureMm: climateForecast.climatePressureMm,
      maxTemperatureC: heat.maxTemperatureC,
      hotDayCount: heat.hotDayCount,
    },
    headline: display.headline,
    summary: display.summary,
    action: display.action,
    evidence,
    missing: Array.from(new Set(missing)),
    guardrails: [
      'Su Kıtlığı Planı, Production Sulama Motoru NET su kararını değiştirmez; kaynak kısıtını ve fenoloji önceliğini onun üstüne bindirir.',
      'Kontrollü Azalt sonucu optimum eksik sulama yüzdesi veya verim kaybı tahmini değildir.',
      'Kullanılabilir su miktarı kullanıcı/işletme kaydından gelir; sistem su rezervini uydurmaz.',
      '35 °C sayımı ürün-hasar eşiği değildir; yalnız yüksek ısı yükü bağlamıdır.',
      'Kritik fenoloji evresinde su azaltımı, ürün/çeşit ve yerel koşullar doğrulanmadan sayısal reçeteye çevrilmez.',
    ],
  };
}

export async function saveFieldWaterBudget(fieldIdInput: string, input: SaveFieldWaterBudgetInput) {
  const fieldId = text(fieldIdInput);
  if (!fieldId) throw new Error('Su bütçesi için tarla seçilemedi.');

  const periodStart = dateOnly(input.periodStart);
  const periodEnd = dateOnly(input.periodEnd);
  const availableWaterM3 = finite(input.availableWaterM3);
  const maxDailyWaterM3 = finite(input.maxDailyWaterM3);

  if (!periodStart || !periodEnd || periodEnd < periodStart) {
    throw new Error('Su bütçesi için geçerli başlangıç ve bitiş tarihi gerekli.');
  }
  if (availableWaterM3 === null || availableWaterM3 < 0) {
    throw new Error('Kullanılabilir su miktarı 0 veya daha büyük bir m³ değeri olmalı.');
  }
  if (maxDailyWaterM3 !== null && maxDailyWaterM3 < 0) {
    throw new Error('Günlük azami su miktarı negatif olamaz.');
  }

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error('Su bütçesini kaydetmek için oturum gerekli.');

  const now = new Date().toISOString();
  const today = isoToday();
  const { data: activeRow, error: activeError } = await supabase
    .from('field_water_budgets')
    .select('id')
    .eq('user_id', auth.user.id)
    .eq('field_id', fieldId)
    .lte('period_start', today)
    .gte('period_end', today)
    .order('period_start', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeError && activeError.code !== '42P01') throw activeError;

  const values = {
    user_id: auth.user.id,
    field_id: fieldId,
    period_start: periodStart,
    period_end: periodEnd,
    available_water_m3: availableWaterM3,
    source_label: text(input.sourceLabel) || null,
    source_type: normalizeSourceType(input.sourceType),
    max_daily_water_m3: maxDailyWaterM3,
    notes: text(input.notes) || null,
    verified_at: now,
    updated_at: now,
  };

  const request = activeRow?.id
    ? supabase.from('field_water_budgets').update(values).eq('id', activeRow.id).eq('user_id', auth.user.id)
    : supabase.from('field_water_budgets').upsert(values, { onConflict: 'user_id,field_id,period_start,period_end' });

  const { data, error } = await request
    .select('id,field_id,period_start,period_end,available_water_m3,source_label,source_type,max_daily_water_m3,notes,verified_at,updated_at')
    .single();

  if (error) {
    if (error.code === '42P01') {
      throw new Error('Su bütçesi tablosu henüz Supabase veritabanına uygulanmamış.');
    }
    throw error;
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('tp:water-scarcity-budget-updated', { detail: { fieldId } }));
    window.dispatchEvent(new CustomEvent('tp:field-context-updated', {
      detail: {
        fieldId,
        changedFields: ['water_budget', 'water_scarcity_plan', 'irrigation_decision'],
        source: 'water-scarcity-plan-v23',
      },
    }));
  }

  return mapBudget(data);
}
