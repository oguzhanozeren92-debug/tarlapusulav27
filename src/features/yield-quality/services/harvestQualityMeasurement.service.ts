import { supabase } from '../../../supabaseClient';

export type HarvestQualityMeasurements = {
  protein_pct?: number | null;
  moisture_pct?: number | null;
  hectoliter_kg_hl?: number | null;
  brix?: number | null;
  fruit_size_mm?: number | null;
  fruit_weight_g?: number | null;
  [key: string]: number | string | null | undefined;
};

export type HarvestQualityMeasurementRecord = {
  id: string;
  fieldId: string;
  year: number;
  crop: string | null;
  harvestDate: string | null;
  measuredAt: string;
  measurements: HarvestQualityMeasurements;
  notes: string | null;
  source: string;
};

function finite(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeRow(row: any): HarvestQualityMeasurementRecord {
  const custom = row?.custom_metrics && typeof row.custom_metrics === 'object'
    ? row.custom_metrics
    : {};
  const measurements: HarvestQualityMeasurements = {
    protein_pct: finite(row?.protein_pct),
    moisture_pct: finite(row?.moisture_pct),
    hectoliter_kg_hl: finite(row?.hectoliter_kg_hl),
    brix: finite(row?.brix),
    fruit_size_mm: finite(row?.fruit_size_mm),
    fruit_weight_g: finite(row?.fruit_weight_g),
    ...custom,
  };

  Object.keys(measurements).forEach((key) => {
    const value = measurements[key];
    if (value === null || value === undefined || String(value).trim() === '') delete measurements[key];
  });

  return {
    id: String(row?.id ?? ''),
    fieldId: String(row?.field_id ?? ''),
    year: Number(row?.year),
    crop: row?.crop == null ? null : String(row.crop),
    harvestDate: row?.harvest_date == null ? null : String(row.harvest_date).slice(0, 10),
    measuredAt: String(row?.measured_at ?? row?.created_at ?? ''),
    measurements,
    notes: row?.notes == null ? null : String(row.notes),
    source: String(row?.source ?? 'user'),
  };
}

export async function loadLatestHarvestQualityMeasurement(fieldIdInput: string, year?: number) {
  const fieldId = String(fieldIdInput ?? '').trim();
  if (!fieldId) return null;

  let query = supabase
    .from('harvest_quality_measurements')
    .select('id,field_id,year,crop,harvest_date,measured_at,protein_pct,moisture_pct,hectoliter_kg_hl,brix,fruit_size_mm,fruit_weight_g,custom_metrics,notes,source,created_at')
    .eq('field_id', fieldId)
    .order('measured_at', { ascending: false })
    .limit(1);

  if (Number.isInteger(year)) query = query.eq('year', Number(year));

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data ? normalizeRow(data) : null;
}

export async function saveHarvestQualityMeasurement(input: {
  fieldId: string;
  year: number;
  crop?: string | null;
  harvestDate?: string | null;
  proteinPct?: number | null;
  moisturePct?: number | null;
  hectoliterKgHl?: number | null;
  brix?: number | null;
  fruitSizeMm?: number | null;
  fruitWeightG?: number | null;
  notes?: string | null;
}) {
  const fieldId = String(input.fieldId ?? '').trim();
  if (!fieldId) throw new Error('Kalite ölçümü için tarla seçilemedi.');
  if (!Number.isInteger(input.year)) throw new Error('Kalite ölçümü için üretim yılı gerekli.');

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) throw new Error('Kalite ölçümünü kaydetmek için oturum gerekli.');

  const payload = {
    user_id: auth.user.id,
    field_id: fieldId,
    year: input.year,
    crop: input.crop || null,
    harvest_date: input.harvestDate || null,
    protein_pct: input.proteinPct ?? null,
    moisture_pct: input.moisturePct ?? null,
    hectoliter_kg_hl: input.hectoliterKgHl ?? null,
    brix: input.brix ?? null,
    fruit_size_mm: input.fruitSizeMm ?? null,
    fruit_weight_g: input.fruitWeightG ?? null,
    notes: input.notes || null,
    source: 'user',
    measured_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('harvest_quality_measurements')
    .insert(payload)
    .select('id,field_id,year,crop,harvest_date,measured_at,protein_pct,moisture_pct,hectoliter_kg_hl,brix,fruit_size_mm,fruit_weight_g,custom_metrics,notes,source,created_at')
    .single();
  if (error) throw error;
  return normalizeRow(data);
}
