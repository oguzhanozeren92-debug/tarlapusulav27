import { supabase } from '../supabaseClient';

export type ParcelLookupInput = {
  province: string;
  district: string;
  village: string;
  ada: string;
  parcel: string;
};

export type ParcelLookupResult = {
  found: boolean;
  message?: string;
  source?: string;
  geometry?: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null;
  centroid?: {
    latitude: number;
    longitude: number;
  } | null;
  areaDecare?: number | null;
};

export type MapBoundaryCandidate = {
  id: string;
  geometry: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
  containsAnchor: boolean;
  areaM2: number | null;
  areaDecare: number | null;
  areaDifferenceRatio: number | null;
  confidence: number | null;
  source: string;
};

export type MapBoundaryLookupInput = {
  latitude: number;
  longitude: number;
  areaDecare?: number | null;
  maxCandidates?: number;
};

export type MapBoundaryLookupResult = {
  found: boolean;
  message?: string;
  source?: string;
  warning?: string;
  note?: string;
  suggestedCandidateId: string | null;
  candidates: MapBoundaryCandidate[];
};

function normalizePolygonFeature(
  rawGeometry: unknown,
): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null {
  const value: any = rawGeometry;

  if (
    value?.type === 'Feature' &&
    value?.geometry &&
    (value.geometry.type === 'Polygon' || value.geometry.type === 'MultiPolygon')
  ) {
    return {
      type: 'Feature',
      properties: value.properties ?? {},
      geometry: value.geometry,
    };
  }

  const geometry = value?.geometry ?? value;
  if (geometry?.type === 'Polygon' || geometry?.type === 'MultiPolygon') {
    return {
      type: 'Feature',
      properties: value?.properties ?? {},
      geometry,
    };
  }

  return null;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function lookupParcel(
  input: ParcelLookupInput,
): Promise<ParcelLookupResult> {
  if (!supabase) {
    throw new Error('Parsel servisine bağlanılamadı.');
  }

  const { data, error } = await supabase.functions.invoke('parcel-lookup', {
    body: {
      mode: 'official_lookup',
      province: input.province,
      district: input.district,
      village: input.village,
      ada: input.ada,
      parcel: input.parcel,
    },
  });

  if (error) {
    console.error('parcel-lookup invoke error:', error);
    throw new Error(
      error.message || 'Parsel sorgusu sırasında bağlantı hatası oluştu.',
    );
  }

  if (!data) {
    return {
      found: false,
      message: 'Parsel servisinden yanıt alınamadı.',
    };
  }

  const geometry = normalizePolygonFeature(
    data.geometry ?? data.parcelGeometry ?? data.feature ?? null,
  );

  const rawCentroid = data.centroid ?? data.center ?? null;
  const latitude = Number(
    rawCentroid?.latitude ?? rawCentroid?.lat ?? data.latitude ?? data.lat,
  );
  const longitude = Number(
    rawCentroid?.longitude ??
      rawCentroid?.lng ??
      rawCentroid?.lon ??
      data.longitude ??
      data.lng ??
      data.lon,
  );

  const centroid =
    Number.isFinite(latitude) && Number.isFinite(longitude)
      ? { latitude, longitude }
      : null;

  const rawArea =
    data.areaDecare ??
    data.area_decare ??
    data.areaDa ??
    data.area_da ??
    data.area ??
    null;
  const areaDecare = nullableNumber(rawArea);

  return {
    found: Boolean(data.found) || Boolean(geometry),
    message: data.message,
    source: data.source,
    geometry,
    centroid,
    areaDecare,
  };
}

export async function lookupMapBoundary(
  input: MapBoundaryLookupInput,
): Promise<MapBoundaryLookupResult> {
  if (!supabase) {
    throw new Error('Harita sınır servisine bağlanılamadı.');
  }

  const { data, error } = await supabase.functions.invoke('parcel-lookup', {
    body: {
      mode: 'map_boundary',
      latitude: input.latitude,
      longitude: input.longitude,
      ...(input.areaDecare !== null &&
      input.areaDecare !== undefined &&
      Number.isFinite(input.areaDecare) &&
      input.areaDecare > 0
        ? { areaDecare: input.areaDecare }
        : {}),
      maxCandidates: input.maxCandidates ?? 6,
    },
  });

  if (error) {
    console.error('parcel-lookup map_boundary invoke error:', error);
    throw new Error(
      error.message || 'Uydu sınır adayları alınırken bağlantı hatası oluştu.',
    );
  }

  if (!data) {
    return {
      found: false,
      message: 'Uydu sınır servisinden yanıt alınamadı.',
      suggestedCandidateId: null,
      candidates: [],
    };
  }

  const candidates: MapBoundaryCandidate[] = Array.isArray(data.candidates)
    ? data.candidates
        .map((candidate: any, index: number) => {
          const geometry = normalizePolygonFeature(candidate?.geometry ?? candidate);
          if (!geometry) return null;

          return {
            id: String(candidate?.id ?? index),
            geometry,
            containsAnchor: Boolean(candidate?.containsAnchor),
            areaM2: nullableNumber(candidate?.areaM2),
            areaDecare: nullableNumber(candidate?.areaDecare),
            areaDifferenceRatio: nullableNumber(candidate?.areaDifferenceRatio),
            confidence: nullableNumber(candidate?.confidence),
            source: String(candidate?.source ?? data.source ?? 'Agribound · Fields of The World'),
          } satisfies MapBoundaryCandidate;
        })
        .filter(Boolean) as MapBoundaryCandidate[]
    : [];

  return {
    found: Boolean(data.found) && candidates.length > 0,
    message: data.message,
    source: data.source,
    warning: data.warning,
    note: data.note,
    suggestedCandidateId:
      data.suggestedCandidateId === null || data.suggestedCandidateId === undefined
        ? null
        : String(data.suggestedCandidateId),
    candidates,
  };
}