import { fromUrl } from 'geotiff';

import {
  readFieldMapLayerCache,
  writeFieldMapLayerCache,
} from '../../home-map/services/fieldMapLayerCache';

export type WorldClimReferenceStatus =
  | 'ready'
  | 'unavailable'
  | 'error';

export type WorldClimReference = {
  status: WorldClimReferenceStatus;
  source: 'WorldClim 2.1';
  productionAuthority: false;
  fieldId: string;
  latitude: number;
  longitude: number;
  baselinePeriod: '1970-2000';
  resolution: '30 arc-seconds';
  countryTile: 'TUR';
  variables: {
    annualMeanTemperatureC: number | null;
    maxTemperatureWarmestMonthC: number | null;
    minTemperatureColdestMonthC: number | null;
    annualPrecipitationMm: number | null;
    precipitationWettestMonthMm: number | null;
    precipitationDriestMonthMm: number | null;
    precipitationSeasonalityCv: number | null;
  };
  evidence: string[];
  warnings: string[];
  provenance: {
    dataset: 'WorldClim 2.1';
    baseline: '1970-2000';
    product: 'Bioclimatic variables';
    rasterUrl: string;
    bands: {
      bio1: 'Annual Mean Temperature';
      bio5: 'Max Temperature of Warmest Month';
      bio6: 'Min Temperature of Coldest Month';
      bio12: 'Annual Precipitation';
      bio13: 'Precipitation of Wettest Month';
      bio14: 'Precipitation of Driest Month';
      bio15: 'Precipitation Seasonality';
    };
  };
  generatedAt: string;
};

const WORLDCLIM_TURKEY_BIO_URL =
  'https://geodata.ucdavis.edu/climate/worldclim/2_1/tiles/iso/TUR_wc2.1_30s_bio.tif';

const CACHE_NAMESPACE = 'worldclim-v2-1-reference';
const CACHE_TTL_MS = 180 * 24 * 60 * 60 * 1000;

/*
 * TarlaPusula şu anda Türkiye odaklıdır. WorldClim'in ülke kırpılmış TUR
 * rasterını yanlışlıkla başka ülkelerde kullanmamak için gevşek bir Türkiye
 * kapsama kutusu kullanıyoruz. Gerçek raster nodata kontrolü ayrıca yapılır.
 */
const TURKEY_BOUNDS = {
  minLatitude: 35.5,
  maxLatitude: 42.5,
  minLongitude: 25.0,
  maxLongitude: 45.0,
};

const BIO_SAMPLES = [0, 4, 5, 11, 12, 13, 14] as const;

function finite(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number | null, digits = 1) {
  if (value == null) return null;
  return Number(value.toFixed(digits));
}

function inTurkeyEnvelope(latitude: number, longitude: number) {
  return (
    latitude >= TURKEY_BOUNDS.minLatitude &&
    latitude <= TURKEY_BOUNDS.maxLatitude &&
    longitude >= TURKEY_BOUNDS.minLongitude &&
    longitude <= TURKEY_BOUNDS.maxLongitude
  );
}

function validRaw(value: unknown, noData: number | null) {
  const parsed = finite(value);
  if (parsed == null) return null;

  if (
    noData != null &&
    Math.abs(parsed - noData) <= Math.max(1e-9, Math.abs(noData) * 1e-10)
  ) {
    return null;
  }

  if (Math.abs(parsed) > 1e20) return null;
  return parsed;
}

/*
 * WorldClim dağıtımlarında sıcaklık rasterlarının bazı sürüm/formatlarında
 * 0.1 ölçekli tamsayı, bazılarında ise doğrudan ondalık değer görülebilir.
 * Metadata ölçeğine güvenilemediğinde yalnız sıcaklık BIO bantlarında bu
 * güvenli normalizasyon uygulanır. Sonuç yine fiziksel aralık kontrolünden geçer.
 */
function normalizeTemperature(raw: number | null) {
  if (raw == null) return null;
  const value = Math.abs(raw) > 80 ? raw / 10 : raw;
  return value >= -90 && value <= 70 ? round(value, 1) : null;
}

function normalizePrecipitation(raw: number | null) {
  if (raw == null) return null;
  return raw >= 0 && raw <= 25_000 ? round(raw, 1) : null;
}

function normalizeSeasonality(raw: number | null) {
  if (raw == null) return null;
  return raw >= 0 && raw <= 500 ? round(raw, 1) : null;
}

function cacheKey(
  fieldId: string,
  latitude: number,
  longitude: number,
) {
  return [
    fieldId,
    'worldclim-2.1',
    latitude.toFixed(4),
    longitude.toFixed(4),
  ].join(':');
}

function emptyReference(input: {
  fieldId: string;
  latitude: number;
  longitude: number;
  status: WorldClimReferenceStatus;
  warning: string;
}): WorldClimReference {
  return {
    status: input.status,
    source: 'WorldClim 2.1',
    productionAuthority: false,
    fieldId: input.fieldId,
    latitude: input.latitude,
    longitude: input.longitude,
    baselinePeriod: '1970-2000',
    resolution: '30 arc-seconds',
    countryTile: 'TUR',
    variables: {
      annualMeanTemperatureC: null,
      maxTemperatureWarmestMonthC: null,
      minTemperatureColdestMonthC: null,
      annualPrecipitationMm: null,
      precipitationWettestMonthMm: null,
      precipitationDriestMonthMm: null,
      precipitationSeasonalityCv: null,
    },
    evidence: [],
    warnings: [input.warning],
    provenance: {
      dataset: 'WorldClim 2.1',
      baseline: '1970-2000',
      product: 'Bioclimatic variables',
      rasterUrl: WORLDCLIM_TURKEY_BIO_URL,
      bands: {
        bio1: 'Annual Mean Temperature',
        bio5: 'Max Temperature of Warmest Month',
        bio6: 'Min Temperature of Coldest Month',
        bio12: 'Annual Precipitation',
        bio13: 'Precipitation of Wettest Month',
        bio14: 'Precipitation of Driest Month',
        bio15: 'Precipitation Seasonality',
      },
    },
    generatedAt: new Date().toISOString(),
  };
}

async function sampleWorldClimBioAtPoint(
  longitude: number,
  latitude: number,
) {
  const tiff = await fromUrl(WORLDCLIM_TURKEY_BIO_URL);
  const image = await tiff.getImage();

  const bbox = image.getBoundingBox();
  const width = image.getWidth();
  const height = image.getHeight();
  const [minX, minY, maxX, maxY] = bbox;

  if (
    longitude < minX ||
    longitude > maxX ||
    latitude < minY ||
    latitude > maxY
  ) {
    throw new Error('WorldClim Türkiye rasterı tarla koordinatını kapsamıyor.');
  }

  const x = clamp(
    Math.floor(
      ((longitude - minX) / Math.max(Number.EPSILON, maxX - minX)) * width,
    ),
    0,
    width - 1,
  );

  const y = clamp(
    Math.floor(
      ((maxY - latitude) / Math.max(Number.EPSILON, maxY - minY)) * height,
    ),
    0,
    height - 1,
  );

  /*
   * Tek hücre sınır/nodata sorununu azaltmak için yaklaşık 3x3 komşuluk okunur.
   * Bu uzun dönem klimatoloji referansıdır; tarla içi mikroklima haritası değildir.
   */
  const radius = 1;
  const x0 = clamp(x - radius, 0, width - 1);
  const y0 = clamp(y - radius, 0, height - 1);
  const x1 = clamp(x + radius + 1, 1, width);
  const y1 = clamp(y + radius + 1, 1, height);

  const raster = await image.readRasters({
    window: [x0, y0, x1, y1],
    samples: [...BIO_SAMPLES],
    interleave: true,
  });

  const noData =
    typeof (image as any).getGDALNoData === 'function'
      ? finite((image as any).getGDALNoData())
      : null;

  const buckets: number[][] = BIO_SAMPLES.map(() => []);
  const values = Array.from(raster as ArrayLike<number>);
  const sampleCount = BIO_SAMPLES.length;

  for (let index = 0; index < values.length; index += 1) {
    const bandIndex = index % sampleCount;
    const value = validRaw(values[index], noData);
    if (value != null) buckets[bandIndex].push(value);
  }

  const mean = (items: number[]) =>
    items.length
      ? items.reduce((sum, value) => sum + value, 0) / items.length
      : null;

  const [bio1, bio5, bio6, bio12, bio13, bio14, bio15] =
    buckets.map(mean);

  return {
    annualMeanTemperatureC: normalizeTemperature(bio1),
    maxTemperatureWarmestMonthC: normalizeTemperature(bio5),
    minTemperatureColdestMonthC: normalizeTemperature(bio6),
    annualPrecipitationMm: normalizePrecipitation(bio12),
    precipitationWettestMonthMm: normalizePrecipitation(bio13),
    precipitationDriestMonthMm: normalizePrecipitation(bio14),
    precipitationSeasonalityCv: normalizeSeasonality(bio15),
  };
}

export async function fetchWorldClimReference(input: {
  fieldId: string;
  latitude: number;
  longitude: number;
  forceRefresh?: boolean;
}): Promise<WorldClimReference> {
  const fieldId = String(input.fieldId ?? '').trim();
  const latitude = finite(input.latitude);
  const longitude = finite(input.longitude);

  if (!fieldId || latitude == null || longitude == null) {
    return emptyReference({
      fieldId,
      latitude: latitude ?? 0,
      longitude: longitude ?? 0,
      status: 'unavailable',
      warning: 'WorldClim referansı için geçerli tarla koordinatı gerekli.',
    });
  }

  if (!inTurkeyEnvelope(latitude, longitude)) {
    return emptyReference({
      fieldId,
      latitude,
      longitude,
      status: 'unavailable',
      warning: 'Bu sürüm yalnız WorldClim Türkiye ülke rasterını kullanıyor.',
    });
  }

  const key = cacheKey(fieldId, latitude, longitude);

  if (!input.forceRefresh) {
    const cached = await readFieldMapLayerCache<WorldClimReference>(
      fieldId,
      CACHE_NAMESPACE,
      key,
      CACHE_TTL_MS,
    );

    if (cached?.status === 'ready') return cached;
  }

  try {
    const variables = await sampleWorldClimBioAtPoint(longitude, latitude);
    const usableCount = Object.values(variables).filter(
      (value) => value != null,
    ).length;

    if (usableCount < 4) {
      throw new Error(
        'WorldClim rasterında tarla noktası için yeterli geçerli BIO değeri bulunamadı.',
      );
    }

    const evidence = [
      variables.annualMeanTemperatureC != null
        ? `1970–2000 yıllık ortalama sıcaklık ${variables.annualMeanTemperatureC.toFixed(1)} °C.`
        : '',
      variables.minTemperatureColdestMonthC != null
        ? `En soğuk ayın uzun dönem minimum sıcaklık ortalaması ${variables.minTemperatureColdestMonthC.toFixed(1)} °C.`
        : '',
      variables.maxTemperatureWarmestMonthC != null
        ? `En sıcak ayın uzun dönem maksimum sıcaklık ortalaması ${variables.maxTemperatureWarmestMonthC.toFixed(1)} °C.`
        : '',
      variables.annualPrecipitationMm != null
        ? `1970–2000 yıllık yağış normali yaklaşık ${Math.round(variables.annualPrecipitationMm)} mm.`
        : '',
    ].filter(Boolean);

    const result: WorldClimReference = {
      status: 'ready',
      source: 'WorldClim 2.1',
      productionAuthority: false,
      fieldId,
      latitude,
      longitude,
      baselinePeriod: '1970-2000',
      resolution: '30 arc-seconds',
      countryTile: 'TUR',
      variables,
      evidence,
      warnings: [
        'WorldClim uzun dönem klimatoloji referansıdır; kısa vadeli hava tahmini veya tarla içi mikroklima ölçümü değildir.',
      ],
      provenance: {
        dataset: 'WorldClim 2.1',
        baseline: '1970-2000',
        product: 'Bioclimatic variables',
        rasterUrl: WORLDCLIM_TURKEY_BIO_URL,
        bands: {
          bio1: 'Annual Mean Temperature',
          bio5: 'Max Temperature of Warmest Month',
          bio6: 'Min Temperature of Coldest Month',
          bio12: 'Annual Precipitation',
          bio13: 'Precipitation of Wettest Month',
          bio14: 'Precipitation of Driest Month',
          bio15: 'Precipitation Seasonality',
        },
      },
      generatedAt: new Date().toISOString(),
    };

    await writeFieldMapLayerCache(
      fieldId,
      CACHE_NAMESPACE,
      key,
      result,
      CACHE_TTL_MS,
    );

    return result;
  } catch (error) {
    /*
     * WorldClim sabit klimatoloji olduğu için canlı okuma geçici bozulursa son
     * başarılı, süresi geçmiş kayıt bile uydurma değerden daha güvenlidir.
     */
    const stale = await readFieldMapLayerCache<WorldClimReference>(
      fieldId,
      CACHE_NAMESPACE,
      key,
      CACHE_TTL_MS,
      { allowExpired: true },
    );

    if (stale?.status === 'ready') {
      return {
        ...stale,
        warnings: [
          ...stale.warnings,
          'WorldClim canlı raster erişimi başarısız olduğu için son başarılı klimatoloji cache kaydı kullanıldı.',
        ].slice(-4),
      };
    }

    return emptyReference({
      fieldId,
      latitude,
      longitude,
      status: 'error',
      warning:
        error instanceof Error
          ? `WorldClim referansı okunamadı: ${error.message}`
          : 'WorldClim referansı okunamadı.',
    });
  }
}

export function compactWorldClimReference(
  value: WorldClimReference | null | undefined,
) {
  if (!value) return null;

  return {
    status: value.status,
    source: value.source,
    baselinePeriod: value.baselinePeriod,
    resolution: value.resolution,
    variables: value.variables,
    evidence: value.evidence.slice(0, 4),
    warnings: value.warnings.slice(0, 2),
    productionAuthority: false as const,
  };
}
