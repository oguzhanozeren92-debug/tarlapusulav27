import { supabase } from '../../../supabaseClient';

import {
  refreshModelReadinessBestEffort,
} from '../../../services/modelReadiness.service';

import {
  runDualKcShadowEvidenceBestEffort,
} from '../../irrigation/services/dualKcShadow.service';

import {
  appendOpenAgriOcsmSnapshot,
} from './openAgriOcsm.service';

import type {
  FieldOperation,
  FieldOperationCreateInput,
  FieldOperationType,
} from '../types/fieldOperation';

export type FieldPlantingManagementInput = {
  fieldId: string;
  plantPopulationM2: number;
  rowSpacingCm: number;
  plantingDepthCm: number;
  operationDate: string;
  productName?: string | null;
};

function nullableText(value: unknown) {
  const text = String(value ?? '').trim();
  return text || null;
}

function nullableNumber(value: unknown) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveNumber(value: unknown, max: number) {
  const number = nullableNumber(value);
  return number != null && number > 0 && number <= max ? number : null;
}

function titleForType(type: FieldOperationType) {
  if (type === 'Saha Kontrolü') return 'Saha kontrolü yapıldı';
  if (type === 'Ekim / Dikim') return 'Ekim / dikim yapıldı';
  if (type === 'Diğer') return 'Tarla işlemi kaydedildi';
  return `${type} yapıldı`;
}

async function syncSeasonPlantingDateBestEffort(
  userId: string,
  fieldId: string,
  operationDate: string,
) {
  try {
    const { data: season, error: seasonError } = await supabase
      .from('field_seasons')
      .select('id,planting_date,year')
      .eq('user_id', userId)
      .eq('field_id', fieldId)
      .order('year', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (seasonError) throw seasonError;
    if (!season || season.planting_date) return;

    const { error: updateError } = await supabase
      .from('field_seasons')
      .update({ planting_date: operationDate })
      .eq('id', season.id)
      .eq('user_id', userId);

    if (updateError) throw updateError;
  } catch (error) {
    console.warn('[field-operation] Sezon ekim tarihi senkronize edilemedi:', error);
  }
}

async function syncSeasonHarvestDateBestEffort(
  userId: string,
  fieldId: string,
  operationDate: string,
) {
  try {
    const { data: season, error: seasonError } = await supabase
      .from('field_seasons')
      .select('id,harvest_date,year')
      .eq('user_id', userId)
      .eq('field_id', fieldId)
      .order('year', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (seasonError) throw seasonError;
    if (!season || season.harvest_date) return;

    const { error: updateError } = await supabase
      .from('field_seasons')
      .update({ harvest_date: operationDate })
      .eq('id', season.id)
      .eq('user_id', userId);

    if (updateError) throw updateError;
  } catch (error) {
    console.warn('[field-operation] Sezon hasat tarihi senkronize edilemedi:', error);
  }
}

function syncIrrigationAmountTaskBestEffort(fieldId: string) {
  void supabase
    .rpc('tp_sync_irrigation_amount_task', { p_field_id: fieldId })
    .then(({ error }) => {
      if (error) {
        console.warn('[field-operation] Sulama miktarı görevi senkronize edilemedi:', error.message);
      }
    })
    .catch((error: unknown) => {
      console.warn('[field-operation] Sulama miktarı görevi senkronize edilemedi:', error);
    });
}

export type FieldOperationMutation = 'saved' | 'updated' | 'deleted';

function normalizedOperationType(value: unknown) {
  return String(value ?? '').trim().toLocaleLowerCase('tr-TR');
}

function operationChangedFields(typeInput: unknown) {
  const type = normalizedOperationType(typeInput);
  const changed = new Set<string>([
    'activities',
    'field_operations',
    'cost_history',
    'field_memory',
  ]);

  if (type === 'sulama') {
    ['irrigation_history', 'water_balance', 'irrigation_decision', 'irrigation_distribution_context', 'water_scarcity_plan', 'pyfao56_readiness', 'aquacrop_readiness']
      .forEach((item) => changed.add(item));
  }

  if (type === 'gübreleme' || type === 'gubreleme') {
    ['fertilization_history', 'nutrition_context', 'soil_nutrition_decision']
      .forEach((item) => changed.add(item));
  }

  if (type === 'ilaçlama' || type === 'ilaclama') {
    ['spraying_history', 'plant_protection_context', 'risk_context']
      .forEach((item) => changed.add(item));
  }

  if (type === 'ekim / dikim' || type === 'ekim/dikim') {
    ['planting_history', 'planting_management', 'season', 'phenology_context', 'dssat_readiness']
      .forEach((item) => changed.add(item));
  }

  if (type === 'hasat') {
    ['harvest_history', 'season', 'phenology_context', 'yield_context']
      .forEach((item) => changed.add(item));
  }

  if (['sürme', 'surme', 'ikileme', 'çapalama', 'capalama', 'budama'].includes(type)) {
    ['management_history', 'satellite_interpretation_context', 'radar_interpretation_context']
      .forEach((item) => changed.add(item));
  }

  if (type === 'saha kontrolü' || type === 'saha kontrolu') {
    ['field_observation_history', 'diagnosis_context', 'risk_context']
      .forEach((item) => changed.add(item));
  }

  return [...changed];
}

/**
 * Tarla günlüğüne girilen bir işlemi uygulamanın ortak tarla hafızasına duyurur.
 * Böylece kayıt yalnız geçmiş listesinde kalmaz; Bugün/Pusula, sulama motoru,
 * besleme/koruma kararları, model kanıtları ve diğer context tüketicileri aynı
 * tarlanın güncel yönetim geçmişini tekrar okur.
 *
 * Bu fonksiyon DB'ye kayıt yazmaz. Kayıt başarıyla yazıldıktan/silindikten sonra
 * çağrılır; farklı ekranların doğrudan `activities` tablosuna yazdığı durumları
 * da aynı veri omurgasına bağlamak için dışarı açılmıştır.
 */
export function notifyFieldOperationImpact(input: {
  fieldId: string;
  type: string;
  operation?: Partial<FieldOperation> | null;
  mutation?: FieldOperationMutation;
  source?: string;
  openAgriOcsm?: unknown;
}) {
  const fieldId = String(input.fieldId ?? '').trim();
  const type = String(input.type ?? '').trim();
  const mutation = input.mutation ?? 'saved';
  if (!fieldId || !type) return;

  const normalizedType = normalizedOperationType(type);

  // Sulama geçmişindeki her değişiklik su dengesi ve gölge modelleri için
  // doğrudan yeni kanıttır. Silme de yeniden hesap gerektirir.
  if (normalizedType === 'sulama') {
    refreshModelReadinessBestEffort(fieldId, 'pyfao56');
    refreshModelReadinessBestEffort(fieldId, 'aquacrop');
    runDualKcShadowEvidenceBestEffort(fieldId);
    syncIrrigationAmountTaskBestEffort(fieldId);
  }

  if (normalizedType === 'ekim / dikim' || normalizedType === 'ekim/dikim') {
    refreshModelReadinessBestEffort(fieldId, 'dssat');
  }

  if (typeof window === 'undefined') return;

  const detail = {
    fieldId,
    operation: input.operation ?? null,
    operationType: type,
    mutation,
    source: input.source ?? 'field-operation',
    openAgriOcsm: input.openAgriOcsm ?? null,
  };

  // Eski tüketiciler bu event'i dinliyor; mutation alanı ile save/delete ayrımı
  // yapılabilir. Tüketicilerin çoğu yalnız yeniden sorgu yaptığı için güvenlidir.
  window.dispatchEvent(new CustomEvent('tp:field-operation-saved', { detail }));
  window.dispatchEvent(new CustomEvent('tp:field-operation-changed', { detail }));

  window.dispatchEvent(
    new CustomEvent('tp:field-context-updated', {
      detail: {
        fieldId,
        changedFields: operationChangedFields(type),
        operationType: type,
        mutation,
        source: input.source ?? 'field-operation',
      },
    }),
  );
}

function mapOperation(row: any): FieldOperation {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    fieldId: String(row.field_id),
    type: String(row.activity_type),
    title: String(row.title),
    date: String(row.activity_date),
    productName: nullableText(row.product_name),
    quantity: nullableNumber(row.quantity),
    unit: nullableText(row.unit),
    cost: nullableNumber(row.cost),
    notes: nullableText(row.notes),
    createdAt: String(row.created_at),
  };
}

function localIsoDateOffset(days: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export async function saveFieldPlantingManagement(
  input: FieldPlantingManagementInput,
) {
  const fieldId = String(input.fieldId ?? '').trim();
  const operationDate = String(input.operationDate ?? '').trim();
  const plantPopulationM2 = positiveNumber(input.plantPopulationM2, 2000);
  const rowSpacingCm = positiveNumber(input.rowSpacingCm, 500);
  const plantingDepthCm = positiveNumber(input.plantingDepthCm, 50);

  if (!fieldId) throw new Error('Ekim ayrıntıları için tarla seçilemedi.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(operationDate)) {
    throw new Error('Ekim ayrıntıları için geçerli işlem tarihi gerekli.');
  }
  if (plantPopulationM2 == null) {
    throw new Error('Bitki sıklığı 0–2000 bitki/m² aralığında olmalı.');
  }
  if (rowSpacingCm == null) {
    throw new Error('Sıra arası 0–500 cm aralığında olmalı.');
  }
  if (plantingDepthCm == null) {
    throw new Error('Ekim derinliği 0–50 cm aralığında olmalı.');
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    throw new Error('Ekim ayrıntılarını kaydetmek için oturum gerekli.');
  }

  const now = new Date().toISOString();
  const productName = nullableText(input.productName);
  const managementNote = [
    `Ekim / Dikim kaydı: ${operationDate}.`,
    productName ? `Tohum / fidan / çeşit: ${productName}.` : null,
  ]
    .filter(Boolean)
    .join(' ');

  const { data, error } = await supabase
    .from('field_dssat_planting_management')
    .upsert(
      {
        user_id: authData.user.id,
        field_id: fieldId,
        plant_population_m2: plantPopulationM2,
        row_spacing_cm: rowSpacingCm,
        planting_depth_cm: plantingDepthCm,
        source: 'recorded_operation',
        verified_at: now,
        updated_at: now,
        notes: managementNote,
      },
      { onConflict: 'user_id,field_id' },
    )
    .select(
      'id,field_id,plant_population_m2,row_spacing_cm,planting_depth_cm,source,verified_at,updated_at',
    )
    .single();

  if (error) {
    if (error.code === '42P01') {
      throw new Error('Ekim ayrıntıları tablosu henüz Supabase veritabanına uygulanmamış.');
    }
    throw error;
  }

  refreshModelReadinessBestEffort(fieldId, 'dssat');

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('tp:field-context-updated', {
        detail: {
          fieldId,
          changedFields: ['planting_management', 'dssat_readiness'],
          source: 'field-operation-planting-management',
        },
      }),
    );
  }

  return {
    id: String(data.id),
    fieldId: String(data.field_id),
    plantPopulationM2: Number(data.plant_population_m2),
    rowSpacingCm: Number(data.row_spacing_cm),
    plantingDepthCm: Number(data.planting_depth_cm),
    source: String(data.source),
    verifiedAt: String(data.verified_at),
    updatedAt: String(data.updated_at),
  };
}

export async function listRecentFieldOperations(
  fieldIdInput: string,
  lookbackDays = 30,
  limit = 30,
): Promise<FieldOperation[]> {
  const fieldId = String(fieldIdInput ?? '').trim();
  if (!fieldId) return [];

  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    return [];
  }

  const safeLookback = Math.max(1, Math.min(180, Math.round(lookbackDays)));
  const safeLimit = Math.max(1, Math.min(100, Math.round(limit)));
  const since = localIsoDateOffset(-safeLookback);

  const { data, error } = await supabase
    .from('activities')
    .select(
      'id,user_id,field_id,activity_type,title,activity_date,product_name,quantity,unit,cost,notes,created_at',
    )
    .eq('field_id', fieldId)
    .eq('user_id', authData.user.id)
    .gte('activity_date', since)
    .order('activity_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  if (error) throw error;
  return (data ?? []).map(mapOperation);
}

export async function createFieldOperation(
  input: FieldOperationCreateInput,
): Promise<FieldOperation> {
  const fieldId = String(input.fieldId ?? '').trim();
  const date = String(input.date ?? '').trim();

  if (!fieldId) throw new Error('İşlem için tarla seçilemedi.');
  if (!date) throw new Error('İşlem tarihini seç.');

  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    throw new Error('İşlem kaydetmek için oturum gerekli.');
  }

  const quantity = nullableNumber(input.quantity);
  const cost = nullableNumber(input.cost);

  if (quantity != null && quantity < 0) {
    throw new Error('Miktar sıfırdan küçük olamaz.');
  }

  if (cost != null && cost < 0) {
    throw new Error('Maliyet sıfırdan küçük olamaz.');
  }

  const { data, error } = await supabase
    .from('activities')
    .insert({
      user_id: authData.user.id,
      field_id: fieldId,
      field_section_id: null,
      activity_type: input.type,
      title: titleForType(input.type),
      activity_date: date,
      product_name: nullableText(input.productName),
      quantity,
      unit: quantity == null ? null : nullableText(input.unit),
      cost,
      notes: nullableText(input.notes),
    })
    .select('*')
    .single();

  if (error) throw error;

  const operation = mapOperation(data);

  /*
   * OPENAGRI / OCSM MIRROR
   * ----------------------
   * Kullanıcının asıl kayıt kaynağı activities tablosudur. OCSM bunun yerine
   * geçmez; yalnızca OpenAgri ile birlikte çalışabilir bir JSON-LD aynası üretir.
   * Şu an yalnız resmi örnekleri doğrulanmış üç işlem sınıfını eşliyoruz:
   * Sulama, Gübreleme ve İlaçlama. Diğer işlemler için sentetik ontology sınıfı
   * uydurulmuyor.
   */
  const openAgriOcsm = appendOpenAgriOcsmSnapshot(operation);

  if (operation.type === 'Ekim / Dikim') {
    await syncSeasonPlantingDateBestEffort(
      authData.user.id,
      operation.fieldId,
      operation.date,
    );
  }

  if (operation.type === 'Hasat') {
    await syncSeasonHarvestDateBestEffort(
      authData.user.id,
      operation.fieldId,
      operation.date,
    );
  }

  notifyFieldOperationImpact({
    fieldId: operation.fieldId,
    type: operation.type,
    operation,
    mutation: 'saved',
    source: 'field-operation-modal',
    openAgriOcsm,
  });

  return operation;
}
