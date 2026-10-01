import { supabase } from '../../../supabaseClient';
import type {
  CropStorageLot,
  StorageEnvironmentObservation,
  StorageMycotoxinFamily,
  StorageRiskLevel,
  StorageRiskLotAssessment,
  StorageRiskSnapshot,
} from '../types/storageRisk';

function text(value: unknown) {
  return String(value ?? '').trim();
}

function finite(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalize(value: unknown) {
  return text(value)
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

function isoDay(value: unknown) {
  const day = text(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function dayDiff(from: string | null, to = new Date()) {
  if (!from) return 0;
  const parsed = new Date(`${from}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime())) return 0;
  return Math.max(0, Math.floor((to.getTime() - parsed.getTime()) / 86_400_000));
}

function mycotoxinFamily(crop: unknown): StorageMycotoxinFamily {
  const value = normalize(crop);
  if (['misir', 'maize', 'corn', 'antep fistigi', 'fistik', 'pistachio', 'yer fistigi', 'peanut'].some((item) => value.includes(item))) {
    return 'aflatoxin-relevant';
  }
  if (['bugday', 'arpa', 'yulaf', 'cavdar', 'tritikale', 'findik', 'ceviz', 'badem', 'grain', 'wheat', 'barley', 'oat', 'rye', 'hazelnut', 'walnut', 'almond'].some((item) => value.includes(item))) {
    return 'general-mold';
  }
  return 'not-classified';
}

function rowToLot(row: any): CropStorageLot {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    fieldId: row.field_id ? String(row.field_id) : null,
    crop: text(row.crop),
    harvestDate: isoDay(row.harvest_date),
    storedAt: isoDay(row.stored_at) ?? isoDay(row.created_at) ?? new Date().toISOString().slice(0, 10),
    quantityKg: finite(row.quantity_kg),
    productMoisturePct: finite(row.product_moisture_pct),
    storageType: text(row.storage_type) || null,
    active: row.active !== false,
    notes: text(row.notes) || null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
  };
}

function rowToObservation(row: any): StorageEnvironmentObservation {
  return {
    id: String(row.id),
    lotId: String(row.lot_id),
    userId: String(row.user_id),
    observedAt: String(row.observed_at ?? row.created_at ?? new Date().toISOString()),
    temperatureC: finite(row.temperature_c),
    relativeHumidityPct: finite(row.relative_humidity_pct),
    productMoisturePct: finite(row.product_moisture_pct),
    source: row.source === 'sensor' ? 'sensor' : 'manual',
    notes: text(row.notes) || null,
  };
}

export function assessStorageLot(
  lot: CropStorageLot,
  latestObservation: StorageEnvironmentObservation | null,
  now = new Date(),
): StorageRiskLotAssessment {
  const moisture = latestObservation?.productMoisturePct ?? lot.productMoisturePct;
  const rh = latestObservation?.relativeHumidityPct ?? null;
  const temp = latestObservation?.temperatureC ?? null;
  const durationDays = dayDiff(lot.storedAt, now);
  const family = mycotoxinFamily(lot.crop);
  const evidence: string[] = [];
  const warnings: string[] = [];

  if (moisture != null) evidence.push(`Kayıtlı ürün nemi %${moisture.toFixed(1)}.`);
  if (rh != null) evidence.push(`Son depo bağıl nemi %${rh.toFixed(0)}.`);
  if (temp != null) evidence.push(`Son depo sıcaklığı ${temp.toFixed(1)} °C.`);
  evidence.push(`Depolama süresi yaklaşık ${durationDays} gün.`);

  if (family === 'aflatoxin-relevant') {
    warnings.push('Bu ürün grubu aflatoksin açısından ayrıca dikkat gerektirebilir; çevresel tarama laboratuvar analizi değildir.');
  } else {
    warnings.push('Küf/mikotoksin oluşumu yalnız sıcaklık-nem verisinden teşhis edilemez.');
  }

  const missingEnvironment = moisture == null && rh == null && temp == null;
  if (missingEnvironment) {
    return {
      lot,
      latestObservation,
      riskLevel: 'unknown',
      mycotoxinFamily: family,
      durationDays,
      evidence,
      warnings: [...warnings, 'Ürün nemi veya depo sıcaklık/nem ölçümü olmadan risk sınıfı yükseltilmez.'],
      action: 'Ürün nemini ve depo sıcaklık/nemini ölçerek kaydet.',
    };
  }

  // Bu eşikler teşhis veya ürün güvenliği limiti değildir. Yalnız saha yönetimi
  // için ihtiyatlı çevresel tarama kapısıdır; ürün/çeşit/depolama standardına göre
  // resmi limitler ayrıca uygulanmalıdır.
  const moistureAttention = moisture != null && moisture >= 15;
  const moistureHigh = moisture != null && moisture >= 18;
  const rhAttention = rh != null && rh >= 70;
  const rhHigh = rh != null && rh >= 80;
  const warm = temp != null && temp >= 20 && temp <= 35;
  const prolonged = durationDays >= 7;

  let riskLevel: StorageRiskLevel = 'low';
  if ((moistureHigh && rhAttention) || (rhHigh && warm && prolonged)) riskLevel = 'high';
  else if (moistureAttention || rhAttention || (warm && prolonged)) riskLevel = 'attention';

  const action = riskLevel === 'high'
    ? 'Depoyu ve ürünü aynı gün kontrol et; ürün nemini doğrula, havalandırma/kurutma ihtiyacını değerlendir ve şüpheli üründe uygun laboratuvar analizi planla.'
    : riskLevel === 'attention'
      ? 'Ölçümleri yakın aralıkla tekrarla; nem/sıcaklık eğilimi yükseliyorsa depolama koşullarını düzelt.'
      : 'Kayıtlı ölçümlerde belirgin çevresel uyarı yok; düzenli izlemeye devam et.';

  return { lot, latestObservation, riskLevel, mycotoxinFamily: family, durationDays, evidence, warnings, action };
}

export function buildStorageRiskSnapshot(
  lots: CropStorageLot[],
  observations: StorageEnvironmentObservation[],
  fieldId: string | null = null,
  now = new Date(),
): StorageRiskSnapshot {
  const activeLots = lots.filter((lot) => lot.active && (!fieldId || lot.fieldId === fieldId));
  const byLot = new Map<string, StorageEnvironmentObservation[]>();
  for (const observation of observations) {
    const list = byLot.get(observation.lotId) ?? [];
    list.push(observation);
    byLot.set(observation.lotId, list);
  }

  const assessed = activeLots.map((lot) => {
    const latest = [...(byLot.get(lot.id) ?? [])]
      .sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0] ?? null;
    return assessStorageLot(lot, latest, now);
  });

  const highRiskLotCount = assessed.filter((item) => item.riskLevel === 'high').length;
  const attentionLotCount = assessed.filter((item) => item.riskLevel === 'attention').length;
  const unknownCount = assessed.filter((item) => item.riskLevel === 'unknown').length;
  const riskLevel: StorageRiskLevel = highRiskLotCount > 0
    ? 'high'
    : attentionLotCount > 0
      ? 'attention'
      : assessed.length > 0 && unknownCount === assessed.length
        ? 'unknown'
        : assessed.length > 0
          ? 'low'
          : 'unknown';

  return {
    version: '18.0',
    fieldId,
    status: assessed.length === 0 ? 'no_lots' : unknownCount === assessed.length ? 'needs_data' : 'ready',
    riskLevel,
    lotCount: assessed.length,
    highRiskLotCount,
    attentionLotCount,
    lots: assessed,
    evidence: assessed.flatMap((item) => item.evidence.slice(0, 2)).slice(0, 10),
    guardrails: [
      'storage-risk-is-screening-not-diagnosis',
      'no-aflatoxin-probability-from-temperature-humidity-alone',
      'laboratory-confirmation-required-for-mycotoxin',
      'sensor-data-does-not-replace-product-testing',
    ],
    generatedAt: now.toISOString(),
  };
}

export async function loadStorageRiskSnapshot(fieldIdInput?: string | null): Promise<StorageRiskSnapshot> {
  const fieldId = text(fieldIdInput) || null;
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return buildStorageRiskSnapshot([], [], fieldId);

  let lotQuery = supabase
    .from('crop_storage_lots')
    .select('*')
    .eq('user_id', authData.user.id)
    .eq('active', true)
    .order('updated_at', { ascending: false });
  if (fieldId) lotQuery = lotQuery.eq('field_id', fieldId);
  const { data: lotRows, error: lotError } = await lotQuery;
  if (lotError) {
    if (lotError.code === '42P01') return buildStorageRiskSnapshot([], [], fieldId);
    throw lotError;
  }
  const lots = (lotRows ?? []).map(rowToLot);
  if (!lots.length) return buildStorageRiskSnapshot([], [], fieldId);

  const lotIds = lots.map((lot) => lot.id);
  const { data: observationRows, error: observationError } = await supabase
    .from('crop_storage_environment_observations')
    .select('*')
    .eq('user_id', authData.user.id)
    .in('lot_id', lotIds)
    .order('observed_at', { ascending: false });
  if (observationError && observationError.code !== '42P01') throw observationError;

  return buildStorageRiskSnapshot(lots, (observationRows ?? []).map(rowToObservation), fieldId);
}

export async function createStorageLot(input: {
  fieldId?: string | null;
  crop: string;
  harvestDate?: string | null;
  storedAt: string;
  quantityKg?: number | null;
  productMoisturePct?: number | null;
  storageType?: string | null;
  notes?: string | null;
}) {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error('Depolama kaydı için oturum gerekli.');
  if (!text(input.crop)) throw new Error('Depolanan ürün gerekli.');
  if (!isoDay(input.storedAt)) throw new Error('Geçerli depolama tarihi gerekli.');

  const { data, error } = await supabase.from('crop_storage_lots').insert({
    user_id: authData.user.id,
    field_id: text(input.fieldId) || null,
    crop: text(input.crop),
    harvest_date: isoDay(input.harvestDate),
    stored_at: isoDay(input.storedAt),
    quantity_kg: finite(input.quantityKg),
    product_moisture_pct: finite(input.productMoisturePct),
    storage_type: text(input.storageType) || null,
    notes: text(input.notes) || null,
    updated_at: new Date().toISOString(),
  }).select('*').single();
  if (error) throw error;
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('tp:storage-risk-updated', { detail: { fieldId: text(input.fieldId) || null } }));
  return rowToLot(data);
}

export async function addStorageObservation(input: {
  lotId: string;
  temperatureC?: number | null;
  relativeHumidityPct?: number | null;
  productMoisturePct?: number | null;
  source?: 'manual' | 'sensor';
  notes?: string | null;
}) {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error('Depo ölçümü için oturum gerekli.');
  const { data, error } = await supabase.from('crop_storage_environment_observations').insert({
    user_id: authData.user.id,
    lot_id: text(input.lotId),
    temperature_c: finite(input.temperatureC),
    relative_humidity_pct: finite(input.relativeHumidityPct),
    product_moisture_pct: finite(input.productMoisturePct),
    source: input.source === 'sensor' ? 'sensor' : 'manual',
    notes: text(input.notes) || null,
  }).select('*').single();
  if (error) throw error;
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('tp:storage-risk-updated'));
  return rowToObservation(data);
}
