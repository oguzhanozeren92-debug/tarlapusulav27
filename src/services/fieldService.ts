import { supabase } from '../supabaseClient';
import type {
  CropCycle,
  Field,
  FieldIrrigationMethod,
  FieldIrrigationStatus,
  FieldStatus,
} from '../types';

const FIELD_SELECT =
  'id, name, city, district, village, ada, parcel, area_decare, crop, variety_id, crop_varieties!fields_variety_id_fkey(variety_name), season, status, crop_cycle, planting_year, bearing, irrigation_status, irrigation_method, latitude, longitude, parcel_geometry, parcel_centroid_lat, parcel_centroid_lng, parcel_lookup_status, parcel_lookup_source, sort_order';

function normalizeIrrigationStatus(value: unknown): FieldIrrigationStatus | null {
  const normalized = String(value ?? '').trim();
  return normalized === 'irrigated' || normalized === 'rainfed' || normalized === 'partial'
    ? normalized
    : null;
}

function normalizeIrrigationMethod(value: unknown): FieldIrrigationMethod | null {
  const normalized = String(value ?? '').trim();
  return [
    'sprinkler',
    'basin',
    'border',
    'furrow_every_narrow',
    'furrow_every_wide',
    'furrow_alternating',
    'trickle',
    'unknown',
  ].includes(normalized)
    ? (normalized as FieldIrrigationMethod)
    : null;
}

export async function fetchUserFields(): Promise<Field[]> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) return [];

  const { data, error } = await supabase
    .from('fields')
    .select(FIELD_SELECT)
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) throw error;

  const fieldIds = (data ?? [])
    .map((item) => String(item.id ?? '').trim())
    .filter(Boolean);

  const latestSeasonVarietyByField = new Map<string, string>();

  if (fieldIds.length > 0) {
    const { data: seasonRows, error: seasonReadError } = await supabase
      .from('field_seasons')
      .select('field_id,year,variety_name')
      .in('field_id', fieldIds)
      .not('variety_name', 'is', null)
      .order('year', { ascending: false });

    if (seasonReadError) {
      console.warn(
        'Tarla sezon çeşidi okunamadı; kanonik variety join kullanılacak:',
        seasonReadError,
      );
    } else {
      for (const row of seasonRows ?? []) {
        const fieldId = String(row.field_id ?? '').trim();
        const varietyName = String(row.variety_name ?? '').trim();
        if (!fieldId || !varietyName || latestSeasonVarietyByField.has(fieldId)) continue;
        latestSeasonVarietyByField.set(fieldId, varietyName);
      }
    }
  }

  return (data ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    ada: Number(item.ada ?? 0),
    parsel: Number(item.parcel ?? 0),
    area: Number(item.area_decare ?? 0),
    crop: item.crop ?? 'Ürün belirtilmedi',
    varietyId: item.variety_id ?? null,
    varietyName:
      (Array.isArray(item.crop_varieties)
        ? item.crop_varieties[0]?.variety_name ?? null
        : item.crop_varieties?.variety_name ?? null) ??
      latestSeasonVarietyByField.get(String(item.id)) ??
      null,
    season: Number(item.season ?? new Date().getFullYear()),
    status: (item.status ?? 'good') as FieldStatus,
    city: item.city ?? undefined,
    district: item.district ?? undefined,
    village: item.village ?? undefined,
    latitude:
      item.latitude === null || item.latitude === undefined
        ? null
        : Number(item.latitude),
    longitude:
      item.longitude === null || item.longitude === undefined
        ? null
        : Number(item.longitude),
    parcelGeometry: item.parcel_geometry ?? null,
    parcelCentroidLat:
      item.parcel_centroid_lat === null || item.parcel_centroid_lat === undefined
        ? null
        : Number(item.parcel_centroid_lat),
    parcelCentroidLng:
      item.parcel_centroid_lng === null || item.parcel_centroid_lng === undefined
        ? null
        : Number(item.parcel_centroid_lng),
    parcelLookupStatus: item.parcel_lookup_status ?? null,
    parcelLookupSource: item.parcel_lookup_source ?? null,
    cropCycle: (item.crop_cycle ?? 'annual') as CropCycle,
    plantingYear:
      item.planting_year === null || item.planting_year === undefined
        ? null
        : Number(item.planting_year),
    bearing:
      item.bearing === null || item.bearing === undefined
        ? null
        : Boolean(item.bearing),
    irrigationStatus: normalizeIrrigationStatus(item.irrigation_status),
    irrigationMethod: normalizeIrrigationMethod(item.irrigation_method),
  }));
}

export type CreateFieldInput = {
  name: string;
  city: string;
  district: string;
  village: string;
  ada: string;
  parcel: string;
  latitude: number | null;
  longitude: number | null;
  parcelGeometry: unknown;
  parcelLookupSource: string;
  areaDecare: number;
  crop: string;
  varietyId: string | null;
  varietyName: string | null;
  season: number;
  cropCycle: CropCycle;
  plantingYear: number | null;
  bearing: boolean;
};

export async function createUserField(input: CreateFieldInput) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error('Tarla kaydetmek için giriş yapmalısın.');

  const varietyId = input.varietyId?.trim() || null;
  const varietyName = input.varietyName?.trim() || null;

  const { data: createdField, error } = await supabase
    .from('fields')
    .insert({
      user_id: user.id,
      name: input.name.trim(),
      city: input.city.trim() || null,
      district: input.district.trim() || null,
      village: input.village.trim() || null,
      ada: input.ada.trim(),
      parcel: input.parcel.trim(),
      latitude: input.latitude,
      longitude: input.longitude,
      parcel_geometry: input.parcelGeometry,
      parcel_centroid_lat: input.latitude,
      parcel_centroid_lng: input.longitude,
      parcel_lookup_status: input.parcelGeometry ? 'found' : 'pending',
      parcel_lookup_source: input.parcelLookupSource || null,
      area_decare: input.areaDecare,
      crop: input.crop.trim(),
      variety_id: varietyId,
      season: input.season,
      crop_cycle: input.cropCycle,
      planting_year: input.cropCycle === 'perennial' ? input.plantingYear : null,
      bearing: input.cropCycle === 'perennial' ? input.bearing : null,
      status: 'good',
    })
    .select('id')
    .single();

  if (error) throw error;

  // `fields` tablosundaki trg_tp_sync_field_summary_to_season trigger'ı
  // tarla eklenir eklenmez aynı (field_id, year) sezon satırını oluşturur.
  // Bu yüzden burada tekrar INSERT yapmak 409 / field_seasons_field_year_uidx
  // çakışmasına neden olur. UPSERT kullanarak trigger'ın oluşturduğu satırı
  // çeşit bilgileriyle tamamlıyoruz; trigger yoksa da satır güvenli biçimde oluşur.
  const { error: seasonError } = await supabase.from('field_seasons').upsert(
    {
      user_id: user.id,
      field_id: createdField.id,
      year: input.season,
      crop: input.crop.trim(),
      variety_id: varietyId,
      variety_name: varietyName,
    },
    { onConflict: 'field_id,year' },
  );

  if (seasonError) {
    // Tarla satırını burada silmeye çalışma. `fields` INSERT'i sonrası çalışan
    // trigger sezon satırını ve ona bağlı süreçleri oluşturmuş olabilir; rollback
    // DELETE'i ayrıca 409 üretebilir. Hata üst katmana iletilir ve kayıt korunur.
    throw seasonError;
  }

  return createdField;
}

export async function deleteUserField(fieldId: string): Promise<void> {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error('Tarlayı silmek için giriş yapmalısın.');

  const { data, error } = await supabase
    .from('fields')
    .delete()
    .eq('id', fieldId)
    .eq('user_id', user.id)
    .select('id');

  if (error) throw error;
  if (!data?.length) throw new Error('Tarla bulunamadı veya silme yetkin yok.');
}
