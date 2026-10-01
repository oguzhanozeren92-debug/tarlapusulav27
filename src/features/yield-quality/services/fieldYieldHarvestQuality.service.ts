import { supabase } from '../../../supabaseClient';
import type { Field } from '../../../types';
import { getFieldPhenologySnapshot } from '../../phenology/services/fieldPhenologySnapshot.service';
import { buildYieldHarvestQualitySnapshot } from './yieldHarvestQuality.service';
import { loadLatestHarvestQualityMeasurement } from './harvestQualityMeasurement.service';
import { applyYieldHarvestEnsemble, loadYieldHarvestEnsembleSupport } from './yieldHarvestEnsemble.service';
import type { YieldHistoryPoint } from '../types/yieldHarvestQuality';
import type {
  FieldYieldHarvestQualityLiveSnapshot,
  HarvestDateSourceKind,
  YieldSourceKind,
} from '../types/fieldYieldHarvestQuality';

function text(value: unknown) {
  return String(value ?? '').trim();
}

function finite(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isoDay(value: unknown) {
  const raw = text(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function yearOf(value: unknown) {
  const day = isoDay(value);
  return day ? Number(day.slice(0, 4)) : null;
}

function normalizeCropCycle(value: unknown): 'annual' | 'perennial' | 'unknown' {
  const cycle = text(value).toLocaleLowerCase('tr-TR');
  if (cycle === 'annual') return 'annual';
  if (cycle === 'perennial') return 'perennial';
  return 'unknown';
}

function normalizeUnit(value: unknown) {
  return text(value)
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, '')
    .replace(/ı/g, 'i');
}

function harvestQuantityKg(quantityValue: unknown, unitValue: unknown) {
  const quantity = finite(quantityValue);
  if (quantity === null || quantity < 0) return null;

  const unit = normalizeUnit(unitValue);
  if (['kg', 'kilogram', 'kilograms', 'kilo'].includes(unit)) return quantity;
  if (['t', 'ton', 'tonne', 'tonnes', 'tn'].includes(unit)) return quantity * 1000;
  if (['g', 'gr', 'gram'].includes(unit)) return quantity / 1000;

  // kg/da, kg/ha gibi alan başına değerleri toplam ürünmüş gibi kullanma.
  return null;
}


async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function offsetDay(now: Date, days: number | null | undefined) {
  if (!Number.isFinite(Number(days))) return null;
  const date = new Date(now);
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + Number(days));
  return date.toISOString().slice(0, 10);
}

function latestDay(values: Array<string | null | undefined>) {
  return values
    .map(isoDay)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
}

type HarvestOperationRow = {
  id: string;
  activity_date: string;
  quantity: number | null;
  unit: string | null;
};

function aggregateHarvestOperations(rows: HarvestOperationRow[]) {
  const byYear = new Map<number, { yieldKg: number; harvestDate: string | null; count: number; ids: string[]; usableQuantityIds: string[] }>();
  let usableQuantityCount = 0;

  for (const row of rows) {
    const year = yearOf(row.activity_date);
    if (!year) continue;

    const kg = harvestQuantityKg(row.quantity, row.unit);
    const previous = byYear.get(year) ?? { yieldKg: 0, harvestDate: null, count: 0, ids: [], usableQuantityIds: [] };
    previous.count += 1;
    previous.ids.push(String(row.id));
    previous.harvestDate = latestDay([previous.harvestDate, row.activity_date]);

    if (kg !== null) {
      previous.yieldKg += kg;
      previous.usableQuantityIds.push(String(row.id));
      usableQuantityCount += 1;
    }

    byYear.set(year, previous);
  }

  return { byYear, usableQuantityCount };
}

function buildHistory(input: {
  cycle: 'annual' | 'perennial' | 'unknown';
  perennialRows: any[];
  seasonRows: any[];
  harvestByYear: Map<number, { yieldKg: number; harvestDate: string | null; count: number; ids: string[]; usableQuantityIds: string[] }>;
}) {
  const years = new Set<number>();
  input.perennialRows.forEach((row) => Number.isInteger(Number(row.year)) && years.add(Number(row.year)));
  input.seasonRows.forEach((row) => Number.isInteger(Number(row.year)) && years.add(Number(row.year)));
  input.harvestByYear.forEach((_, year) => years.add(year));

  const perennialByYear = new Map<number, any>(
    input.perennialRows
      .filter((row) => Number.isInteger(Number(row.year)))
      .map((row) => [Number(row.year), row]),
  );

  const seasonByYear = new Map<number, any>(
    input.seasonRows
      .filter((row) => Number.isInteger(Number(row.year)))
      .map((row) => [Number(row.year), row]),
  );

  return [...years]
    .sort((a, b) => a - b)
    .map((year): YieldHistoryPoint => {
      const perennial = perennialByYear.get(year);
      const operation = input.harvestByYear.get(year);
      const season = seasonByYear.get(year);
      const explicitYield = finite(perennial?.yield_kg);
      const operationYield = operation && operation.yieldKg > 0 ? operation.yieldKg : null;

      return {
        year,
        yieldKg: input.cycle === 'perennial'
          ? explicitYield ?? operationYield
          : operationYield ?? explicitYield,
        harvestDate: latestDay([
          perennial?.harvest_date,
          season?.harvest_date,
          operation?.harvestDate,
        ]),
      };
    });
}

export async function loadFieldYieldHarvestQualitySnapshot(
  fieldInput: Field,
  options: { currentDate?: Date; forcePhenologyRefresh?: boolean } = {},
): Promise<FieldYieldHarvestQualityLiveSnapshot> {
  const fieldId = text(fieldInput?.id);
  if (!fieldId) throw new Error('Verim/hasat motoru için tarla seçilemedi.');

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    throw new Error('Verim/hasat verilerini okumak için oturum gerekli.');
  }

  const userId = authData.user.id;
  const now = options.currentDate ?? new Date();
  const currentYear = now.getUTCFullYear();

  const { data: canonicalField, error: fieldError } = await supabase
    .from('fields')
    .select('id,name,area_decare,crop,season,crop_cycle,planting_year,bearing,parcel_geometry,latitude,longitude')
    .eq('id', fieldId)
    .eq('user_id', userId)
    .maybeSingle();

  if (fieldError) throw fieldError;

  const mergedField: Field = {
    ...fieldInput,
    id: canonicalField?.id ?? fieldInput.id,
    name: canonicalField?.name ?? fieldInput.name,
    area: finite(canonicalField?.area_decare) ?? fieldInput.area,
    crop: text(canonicalField?.crop) || fieldInput.crop,
    season: Number.isInteger(Number(canonicalField?.season)) ? Number(canonicalField?.season) : fieldInput.season,
    cropCycle: (text(canonicalField?.crop_cycle) || fieldInput.cropCycle) as Field['cropCycle'],
    plantingYear: Number.isInteger(Number(canonicalField?.planting_year))
      ? Number(canonicalField?.planting_year)
      : fieldInput.plantingYear,
    bearing: typeof canonicalField?.bearing === 'boolean' ? canonicalField.bearing : fieldInput.bearing,
    parcelGeometry: canonicalField?.parcel_geometry ?? fieldInput.parcelGeometry,
    latitude: finite(canonicalField?.latitude) ?? fieldInput.latitude,
    longitude: finite(canonicalField?.longitude) ?? fieldInput.longitude,
  };

  const cycle = normalizeCropCycle(mergedField.cropCycle);

  const [perennialResult, seasonResult, harvestResult, phenologyResult, qualityResult, ensembleSupportResult] = await Promise.allSettled([
    supabase
      .from('perennial_yields')
      .select('id,year,yield_kg,harvest_date,notes')
      .eq('user_id', userId)
      .eq('field_id', fieldId)
      .order('year', { ascending: true })
      .limit(20),
    supabase
      .from('field_seasons')
      .select('id,year,crop,variety_name,planting_date,harvest_date,notes')
      .eq('user_id', userId)
      .eq('field_id', fieldId)
      .order('year', { ascending: true })
      .limit(20),
    supabase
      .from('activities')
      .select('id,activity_date,quantity,unit')
      .eq('user_id', userId)
      .eq('field_id', fieldId)
      .ilike('activity_type', 'hasat')
      .order('activity_date', { ascending: true })
      .limit(100),
    withTimeout(
      getFieldPhenologySnapshot(mergedField, {
        forceRefresh: options.forcePhenologyRefresh ?? false,
        currentDate: now,
      }),
      4500,
      null,
    ),
    loadLatestHarvestQualityMeasurement(fieldId, currentYear),
    loadYieldHarvestEnsembleSupport(fieldId),
  ]);

  const warnings: string[] = [];

  const perennialRows = perennialResult.status === 'fulfilled' && !perennialResult.value.error
    ? perennialResult.value.data ?? []
    : [];
  if (perennialResult.status === 'rejected' || perennialResult.value?.error) {
    warnings.push('Çok yıllık verim geçmişi okunamadı; motor kalan gerçek verilerle devam etti.');
  }

  const seasonRows = seasonResult.status === 'fulfilled' && !seasonResult.value.error
    ? seasonResult.value.data ?? []
    : [];
  if (seasonResult.status === 'rejected' || seasonResult.value?.error) {
    warnings.push('Sezon geçmişi okunamadı; hasat tarihi bağlamı kısmi kaldı.');
  }

  const harvestRows = harvestResult.status === 'fulfilled' && !harvestResult.value.error
    ? (harvestResult.value.data ?? []) as HarvestOperationRow[]
    : [];
  if (harvestResult.status === 'rejected' || harvestResult.value?.error) {
    warnings.push('Hasat işlemleri okunamadı; işlem günlüğündeki miktarlar hesaba katılmadı.');
  }

  const phenology = phenologyResult.status === 'fulfilled' ? phenologyResult.value : null;
  if (!phenology) {
    warnings.push('Fenoloji yanıtı gecikti veya alınamadı; verim/hasat kartı gerçek kayıtlarla hemen gösterildi. Hasat penceresi fenoloji yenilendiğinde tamamlanır.');
  }

  let qualityMeasurement = qualityResult.status === 'fulfilled' ? qualityResult.value : null;
  if (qualityResult.status === 'rejected') {
    warnings.push('Hasat kalite ölçümü okunamadı; kalite katmanı ölçüm yok olarak devam etti.');
  }
  const qualityCrop = text(qualityMeasurement?.crop).toLocaleLowerCase('tr-TR');
  const currentCrop = text(mergedField.crop).toLocaleLowerCase('tr-TR');
  if (qualityMeasurement && qualityCrop && currentCrop && qualityCrop !== currentCrop) {
    warnings.push('Son kalite ölçümü farklı bir ürün adına kayıtlı olduğu için güncel ürün kalite kanıtına alınmadı.');
    qualityMeasurement = null;
  }

  const ensembleSupport = ensembleSupportResult.status === 'fulfilled'
    ? ensembleSupportResult.value
    : { dssat: null, aquacrop: null, pcse: null, sl2p: null, warnings: ['Model destek kanıtları bu yüklemede alınamadı.'] };
  warnings.push(...ensembleSupport.warnings);

  const { byYear: harvestByYear, usableQuantityCount } = aggregateHarvestOperations(harvestRows);
  if (harvestRows.some((row) => finite(row.quantity) !== null && harvestQuantityKg(row.quantity, row.unit) === null)) {
    warnings.push('Bazı hasat miktarları toplam kg/ton biriminde olmadığı için verim toplamına katılmadı.');
  }

  const history = buildHistory({
    cycle,
    perennialRows,
    seasonRows,
    harvestByYear,
  });

  const currentPerennial = perennialRows.find((row: any) => Number(row.year) === currentYear) ?? null;
  const currentSeason = seasonRows.find((row: any) => Number(row.year) === currentYear) ?? null;
  const currentHarvest = harvestByYear.get(currentYear) ?? null;

  let currentYieldKg = finite(currentPerennial?.yield_kg);
  let yieldSource: YieldSourceKind = currentYieldKg !== null ? 'perennial_yields' : 'none';
  if (currentYieldKg === null && currentHarvest && currentHarvest.yieldKg > 0) {
    currentYieldKg = currentHarvest.yieldKg;
    yieldSource = 'harvest_operations';
  }

  let actualHarvestDate = isoDay(currentPerennial?.harvest_date);
  let harvestDateSource: HarvestDateSourceKind = actualHarvestDate ? 'perennial_yields' : 'none';

  if (!actualHarvestDate && isoDay(currentSeason?.harvest_date)) {
    actualHarvestDate = isoDay(currentSeason.harvest_date);
    harvestDateSource = 'field_seasons';
  }
  if (!actualHarvestDate && currentHarvest?.harvestDate) {
    actualHarvestDate = currentHarvest.harvestDate;
    harvestDateSource = 'harvest_operations';
  }
  if (!actualHarvestDate && isoDay(phenology?.context.actualHarvestDate)) {
    actualHarvestDate = isoDay(phenology?.context.actualHarvestDate);
    harvestDateSource = 'phenology';
  }

  const expectedHarvestDate = actualHarvestDate
    ? null
    : offsetDay(now, phenology?.phenology.daysUntilExpectedHarvest);

  const areaDecare = finite(canonicalField?.area_decare) ?? finite(fieldInput.area);
  const baseSnapshot = buildYieldHarvestQualitySnapshot({
    fieldId,
    crop: text(mergedField.crop) || 'Ürün belirtilmedi',
    areaHa: areaDecare !== null && areaDecare > 0 ? areaDecare / 10 : null,
    cropCycle: cycle,
    bearing: mergedField.bearing ?? null,
    currentYear,
    currentStage: phenology?.phenology.stage ?? null,
    expectedHarvestDate,
    actualHarvestDate,
    currentYieldKg,
    history,
    qualityMeasurements: qualityMeasurement?.measurements ?? null,
  }, now);
  const snapshot = applyYieldHarvestEnsemble(baseSnapshot, ensembleSupport);

  return {
    fieldId,
    generatedAt: now.toISOString(),
    snapshot,
    sources: {
      adapterVersion: '15.0',
      canonicalFieldLoaded: Boolean(canonicalField),
      cropCycle: cycle,
      areaDecare,
      yieldSource,
      harvestDateSource,
      perennialYieldRecords: perennialRows.length,
      seasonRecords: seasonRows.length,
      harvestOperations: harvestRows.length,
      harvestOperationsWithUsableQuantity: usableQuantityCount,
      qualityMeasurementLoaded: Boolean(qualityMeasurement),
      phenologyLoaded: Boolean(phenology),
      phenologyStage: phenology?.phenology.stage ?? null,
      ensembleSupportLoaded: ensembleSupportResult.status === 'fulfilled',
      warnings,
      provenance: {
        currentYieldRecordId: currentPerennial?.id ? String(currentPerennial.id) : null,
        currentSeasonRecordId: currentSeason?.id ? String(currentSeason.id) : null,
        currentHarvestOperationIds: currentHarvest?.ids ?? [],
        currentHarvestQuantityOperationIds: currentHarvest?.usableQuantityIds ?? [],
        qualityMeasurementRecordId: qualityMeasurement?.id ?? null,
      },
    },
  };
}
