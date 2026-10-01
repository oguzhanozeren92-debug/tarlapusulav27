import { supabase } from '../supabaseClient';
import type { LocationOption } from '../types';
import { sortTurkishLocationOptions } from '../utils/locationUtils';

type LocationLevel = 'province' | 'district' | 'village';
type LocationSourceMode = 'tkgm' | 'supabase' | null;

type TkgmLocationResponse = {
  ok?: boolean;
  source?: string;
  options?: Array<{
    id: unknown;
    name: unknown;
  }>;
  message?: string;
};


let locationSourceMode: LocationSourceMode = null;

const normalizeOptions = (
  data: Array<{ id: unknown; name: unknown }> | null | undefined,
): LocationOption[] =>
  sortTurkishLocationOptions(
    (data ?? [])
      .map((item) => ({
        id: Number(item.id),
        name: String(item.name ?? '').trim(),
      }))
      .filter((item) => Number.isFinite(item.id) && item.name),
  );

const normalizeTkgmPayload = (payload: any): LocationOption[] => {
  const features = Array.isArray(payload?.features)
    ? payload.features
    : Array.isArray(payload)
      ? payload
      : [];

  return normalizeOptions(
    features.map((feature: any) => {
      const properties = feature?.properties ?? feature ?? {};

      return {
        id:
          properties.id ??
          properties.kod ??
          properties.code ??
          feature?.id,
        name:
          properties.text ??
          properties.name ??
          properties.ad ??
          properties.label ??
          '',
      };
    }),
  );
};


async function fetchTkgmProxyOptions(
  level: LocationLevel,
  parentId?: number,
): Promise<LocationOption[]> {
  const { data, error } = await supabase.functions.invoke<TkgmLocationResponse>(
    'tkgm-location-options',
    {
      body: {
        level,
        parentId: parentId ?? null,
      },
    },
  );

  if (error) throw error;

  const options = normalizeOptions(data?.options);

  if (!data?.ok || !options.length) {
    throw new Error(
      data?.message || 'TKGM konum listesinden geçerli kayıt alınamadı.',
    );
  }

  return options;
}

async function fetchTkgmOptions(
  level: LocationLevel,
  parentId?: number,
): Promise<LocationOption[]> {
  // Tarayıcıdan TKGM'ye doğrudan istek YOK.
  // CORS / 403 gürültüsünü ve istemci tarafı erişim sorunlarını önlemek için
  // yalnız mevcut Supabase proxy fonksiyonu kullanılır.
  return fetchTkgmProxyOptions(level, parentId);
}

async function fetchSupabaseProvinceOptions(): Promise<LocationOption[]> {
  const { data, error } = await supabase
    .from('tr_provinces')
    .select('id, name');

  if (error) throw error;
  return normalizeOptions(data);
}

async function fetchSupabaseDistrictOptions(
  provinceId: number,
): Promise<LocationOption[]> {
  const { data, error } = await supabase
    .from('tr_districts')
    .select('id, name')
    .eq('province_id', provinceId);

  if (error) throw error;
  return normalizeOptions(data);
}

async function fetchSupabaseVillageOptions(
  districtId: number,
): Promise<LocationOption[]> {
  const { data, error } = await supabase
    .from('tr_villages')
    .select('id, name')
    .eq('district_id', districtId);

  if (error) throw error;
  return normalizeOptions(data);
}

export async function fetchProvinceOptions(): Promise<LocationOption[]> {
  try {
    const options = await fetchTkgmOptions('province');
    locationSourceMode = 'tkgm';
    return options;
  } catch (error) {
    console.warn(
      'TKGM il listesi alınamadı; bu oturumda Supabase yedeği kullanılacak:',
      error,
    );
    locationSourceMode = 'supabase';
    return fetchSupabaseProvinceOptions();
  }
}

export async function fetchDistrictOptions(
  provinceId: number,
): Promise<LocationOption[]> {
  if (locationSourceMode === 'tkgm') {
    return fetchTkgmOptions('district', provinceId);
  }

  if (locationSourceMode === null) {
    try {
      const options = await fetchTkgmOptions('district', provinceId);
      locationSourceMode = 'tkgm';
      return options;
    } catch (error) {
      console.warn('TKGM ilçe listesi alınamadı:', error);
      locationSourceMode = 'supabase';
    }
  }

  return fetchSupabaseDistrictOptions(provinceId);
}

export async function fetchVillageOptions(
  districtId: number,
): Promise<LocationOption[]> {
  if (locationSourceMode === 'tkgm') {
    return fetchTkgmOptions('village', districtId);
  }

  if (locationSourceMode === null) {
    try {
      const options = await fetchTkgmOptions('village', districtId);
      locationSourceMode = 'tkgm';
      return options;
    } catch (error) {
      console.warn('TKGM köy / mahalle listesi alınamadı:', error);
      locationSourceMode = 'supabase';
    }
  }

  return fetchSupabaseVillageOptions(districtId);
}
