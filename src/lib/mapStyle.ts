import type { RasterSourceSpecification, StyleSpecification } from 'maplibre-gl';

export const mapboxAccessToken = String(
  import.meta.env.VITE_MAPBOX_ACCESS_TOKEN ?? '',
).trim();

const MAPBOX_ATTRIBUTION =
  '&copy; Mapbox &copy; OpenStreetMap';

const ESRI_FALLBACK_ATTRIBUTION =
  'Tiles &copy; Esri';

export const hasMapboxSatellite = mapboxAccessToken.startsWith('pk.');

export function createEsriSatelliteRasterSource(
  maxzoom = 19,
): RasterSourceSpecification {
  return {
    type: 'raster',
    tiles: [
      'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    ],
    tileSize: 256,
    maxzoom: Math.min(maxzoom, 19),
    attribution: ESRI_FALLBACK_ATTRIBUTION,
  };
}

export function createSatelliteRasterSource(
  maxzoom = 22,
): RasterSourceSpecification {
  if (hasMapboxSatellite) {
    return {
      type: 'raster',
      tiles: [
        `https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg90?access_token=${encodeURIComponent(
          mapboxAccessToken,
        )}`,
      ],
      tileSize: 256,
      maxzoom,
      attribution: MAPBOX_ATTRIBUTION,
    };
  }

  return createEsriSatelliteRasterSource(maxzoom);
}

export const vividSatellitePaint = {
  'raster-saturation': 0,
  'raster-contrast': 0,
  'raster-brightness-min': 0,
  'raster-brightness-max': 1,
} as const;

/**
 * Mapbox varsa Esri'yi altta sıcak yedek olarak tutar. Mapbox karosu geçici
 * hata verdiğinde üst raster transparan kalır ve kullanıcı boş/katmansız bir
 * harita yerine Esri World Imagery'yi görmeye devam eder.
 */
export function createResilientSatelliteStyle(
  baseLayerId: string,
  sourceMaxZoom = 22,
): StyleSpecification {
  if (!hasMapboxSatellite) {
    return {
      version: 8,
      sources: {
        satellite: createEsriSatelliteRasterSource(sourceMaxZoom),
      },
      layers: [
        {
          id: baseLayerId,
          type: 'raster',
          source: 'satellite',
          paint: vividSatellitePaint,
        },
      ],
    };
  }

  return {
    version: 8,
    sources: {
      'satellite-fallback': createEsriSatelliteRasterSource(sourceMaxZoom),
      satellite: createSatelliteRasterSource(sourceMaxZoom),
    },
    layers: [
      {
        id: `${baseLayerId}-fallback`,
        type: 'raster',
        source: 'satellite-fallback',
        paint: vividSatellitePaint,
      },
      {
        id: baseLayerId,
        type: 'raster',
        source: 'satellite',
        paint: vividSatellitePaint,
      },
    ],
  };
}
