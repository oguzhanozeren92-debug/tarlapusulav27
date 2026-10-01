import { supabase } from '../../../supabaseClient';
import type {
  OrchardPilotCropKey,
  OrchardTreeLoadLevel,
  OrchardTreeObservationRecord,
  OrchardTreeObservationSource,
  OrchardTreeRecord,
  OrchardTreeStage,
  OrchardTreeStressLevel,
  OrchardTreeWaterStatus,
} from '../types/orchardTree';

const ALMOND_ALIASES = new Set(['badem', 'almond']);
const PISTACHIO_ALIASES = new Set([
  'antep fıstığı', 'antep fistigi', 'antepfıstığı', 'antepfistigi', 'fıstık', 'fistik', 'pistachio',
]);

function normalize(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ');
}

function finiteOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function intOrNull(value: unknown) {
  const number = finiteOrNull(value);
  return number === null ? null : Math.trunc(number);
}

export function resolveOrchardPilotCrop(crop: unknown): OrchardPilotCropKey | null {
  const key = normalize(crop);
  if (ALMOND_ALIASES.has(key)) return 'almond';
  if (PISTACHIO_ALIASES.has(key)) return 'pistachio';
  return null;
}

export function isOrchardTreePilotCrop(crop: unknown) {
  return resolveOrchardPilotCrop(crop) !== null;
}

function treeFromRow(row: any): OrchardTreeRecord {
  return {
    id: String(row.id),
    fieldId: String(row.field_id),
    treeCode: String(row.tree_code ?? '').trim(),
    crop: row.crop ? String(row.crop) : null,
    variety: row.variety ? String(row.variety) : null,
    rootstock: row.rootstock ? String(row.rootstock) : null,
    plantingYear: intOrNull(row.planting_year),
    latitude: finiteOrNull(row.latitude),
    longitude: finiteOrNull(row.longitude),
    rowNo: row.row_no ? String(row.row_no) : null,
    treeNo: row.tree_no ? String(row.tree_no) : null,
    canopyDiameterM: finiteOrNull(row.canopy_diameter_m),
    canopyHeightM: finiteOrNull(row.canopy_height_m),
    active: row.active !== false,
    notes: row.notes ? String(row.notes) : null,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? row.created_at ?? ''),
  };
}

function observationFromRow(row: any): OrchardTreeObservationRecord {
  return {
    id: String(row.id),
    fieldId: String(row.field_id),
    treeId: String(row.tree_id),
    observedAt: String(row.observed_at ?? row.created_at ?? ''),
    stage: String(row.stage ?? 'unknown') as OrchardTreeStage,
    waterStatus: String(row.water_status ?? 'unknown') as OrchardTreeWaterStatus,
    stressLevel: String(row.stress_level ?? 'unknown') as OrchardTreeStressLevel,
    flowerIntensity: String(row.flower_intensity ?? 'unknown') as OrchardTreeLoadLevel,
    fruitLoad: String(row.fruit_load ?? 'unknown') as OrchardTreeLoadLevel,
    fruitCountMeasured: intOrNull(row.fruit_count_measured),
    yieldKgMeasured: finiteOrNull(row.yield_kg_measured),
    trunkDiameterMm: finiteOrNull(row.trunk_diameter_mm),
    sapFlowLph: finiteOrNull(row.sap_flow_lph),
    source: String(row.source ?? 'manual') as OrchardTreeObservationSource,
    notes: row.notes ? String(row.notes) : null,
    createdAt: String(row.created_at ?? ''),
  };
}

async function requireUserId() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const userId = data.session?.user?.id;
  if (!userId) throw new Error('Ağaç kaydı için oturum bulunamadı.');
  return userId;
}

export async function listOrchardTrees(fieldIdInput: unknown): Promise<OrchardTreeRecord[]> {
  const fieldId = String(fieldIdInput ?? '').trim();
  if (!fieldId) return [];

  const { data, error } = await supabase
    .from('orchard_trees')
    .select('*')
    .eq('field_id', fieldId)
    .eq('active', true)
    .order('tree_code', { ascending: true });

  if (error) {
    if (/relation .*orchard_trees.* does not exist/i.test(error.message ?? '')) return [];
    throw error;
  }
  return (data ?? []).map(treeFromRow);
}

export async function listOrchardTreeObservations(
  fieldIdInput: unknown,
  limit = 500,
): Promise<OrchardTreeObservationRecord[]> {
  const fieldId = String(fieldIdInput ?? '').trim();
  if (!fieldId) return [];

  const { data, error } = await supabase
    .from('orchard_tree_observations')
    .select('*')
    .eq('field_id', fieldId)
    .order('observed_at', { ascending: false })
    .limit(Math.max(1, Math.min(limit, 2000)));

  if (error) {
    if (/relation .*orchard_tree_observations.* does not exist/i.test(error.message ?? '')) return [];
    throw error;
  }
  return (data ?? []).map(observationFromRow);
}

export async function saveOrchardTree(input: {
  id?: string | null;
  fieldId: string;
  crop: string;
  treeCode: string;
  variety?: string | null;
  rootstock?: string | null;
  plantingYear?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  rowNo?: string | null;
  treeNo?: string | null;
  canopyDiameterM?: number | null;
  canopyHeightM?: number | null;
  notes?: string | null;
}): Promise<OrchardTreeRecord> {
  const userId = await requireUserId();
  const fieldId = String(input.fieldId ?? '').trim();
  const treeCode = String(input.treeCode ?? '').trim();
  if (!fieldId || !treeCode) throw new Error('Tarla ve ağaç kodu gerekli.');
  if (!resolveOrchardPilotCrop(input.crop)) {
    throw new Error('Ağaç bazlı Pusula pilotu şu anda Badem ve Antep Fıstığı için açıktır.');
  }

  const latitude = finiteOrNull(input.latitude);
  const longitude = finiteOrNull(input.longitude);
  if ((latitude === null) !== (longitude === null)) {
    throw new Error('Konum girilecekse enlem ve boylam birlikte girilmelidir.');
  }
  if (latitude !== null && (latitude < -90 || latitude > 90)) throw new Error('Enlem geçersiz.');
  if (longitude !== null && (longitude < -180 || longitude > 180)) throw new Error('Boylam geçersiz.');

  const payload = {
    user_id: userId,
    field_id: fieldId,
    tree_code: treeCode,
    crop: String(input.crop ?? '').trim(),
    variety: String(input.variety ?? '').trim() || null,
    rootstock: String(input.rootstock ?? '').trim() || null,
    planting_year: intOrNull(input.plantingYear),
    latitude,
    longitude,
    row_no: String(input.rowNo ?? '').trim() || null,
    tree_no: String(input.treeNo ?? '').trim() || null,
    canopy_diameter_m: finiteOrNull(input.canopyDiameterM),
    canopy_height_m: finiteOrNull(input.canopyHeightM),
    notes: String(input.notes ?? '').trim() || null,
    active: true,
    updated_at: new Date().toISOString(),
  };

  let query = supabase.from('orchard_trees');
  const response = input.id
    ? await query.update(payload).eq('id', input.id).eq('field_id', fieldId).select('*').single()
    : await query.insert(payload).select('*').single();

  if (response.error) throw response.error;
  return treeFromRow(response.data);
}

export async function saveOrchardTreeObservation(input: {
  fieldId: string;
  treeId: string;
  observedAt?: string | null;
  stage?: OrchardTreeStage;
  waterStatus?: OrchardTreeWaterStatus;
  stressLevel?: OrchardTreeStressLevel;
  flowerIntensity?: OrchardTreeLoadLevel;
  fruitLoad?: OrchardTreeLoadLevel;
  fruitCountMeasured?: number | null;
  yieldKgMeasured?: number | null;
  trunkDiameterMm?: number | null;
  sapFlowLph?: number | null;
  source?: OrchardTreeObservationSource;
  notes?: string | null;
}): Promise<OrchardTreeObservationRecord> {
  const userId = await requireUserId();
  const fieldId = String(input.fieldId ?? '').trim();
  const treeId = String(input.treeId ?? '').trim();
  if (!fieldId || !treeId) throw new Error('Tarla ve ağaç seçimi gerekli.');

  const { data, error } = await supabase
    .from('orchard_tree_observations')
    .insert({
      user_id: userId,
      field_id: fieldId,
      tree_id: treeId,
      observed_at: input.observedAt || new Date().toISOString(),
      stage: input.stage ?? 'unknown',
      water_status: input.waterStatus ?? 'unknown',
      stress_level: input.stressLevel ?? 'unknown',
      flower_intensity: input.flowerIntensity ?? 'unknown',
      fruit_load: input.fruitLoad ?? 'unknown',
      fruit_count_measured: intOrNull(input.fruitCountMeasured),
      yield_kg_measured: finiteOrNull(input.yieldKgMeasured),
      trunk_diameter_mm: finiteOrNull(input.trunkDiameterMm),
      sap_flow_lph: finiteOrNull(input.sapFlowLph),
      source: input.source ?? 'manual',
      notes: String(input.notes ?? '').trim() || null,
    })
    .select('*')
    .single();

  if (error) throw error;
  return observationFromRow(data);
}
