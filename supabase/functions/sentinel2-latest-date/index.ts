const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ParcelGeometry = {
  type: 'Feature';
  properties?: Record<string, unknown>;
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: any;
  };
};

type RequestBody = {
  geometry?: ParcelGeometry;
  daysBack?: number;
  maxCloudCoverage?: number;
};

const TOKEN_URL =
  'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token';
const STATISTICS_URL = 'https://sh.dataspace.copernicus.eu/statistics/v1';

const NDVI_STATS_SCRIPT = `
//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "SCL", "dataMask"] }],
    output: [
      { id: "default", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function validPixel(scl) {
  return !(scl === 0 || scl === 1 || scl === 3 || scl === 8 || scl === 9 || scl === 10 || scl === 11);
}
function evaluatePixel(sample) {
  let valid = sample.dataMask === 1 && validPixel(sample.SCL);
  if (!valid) return { default: [0], dataMask: [0] };
  let denom = sample.B08 + sample.B04;
  if (denom === 0) return { default: [0], dataMask: [0] };
  return {
    default: [(sample.B08 - sample.B04) / denom],
    dataMask: [1]
  };
}
`;

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const dateOnly = (date: Date) => date.toISOString().slice(0, 10);

const makeBounds = (geometry: ParcelGeometry) => ({
  geometry: {
    type: geometry.geometry.type,
    coordinates: geometry.geometry.coordinates,
  },
  properties: {
    crs: 'http://www.opengis.net/def/crs/OGC/1.3/CRS84',
  },
});

function collectCoordinates(value: unknown, out: Array<[number, number]>) {
  if (!Array.isArray(value)) return;
  if (value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) {
    out.push([Number(value[0]), Number(value[1])]);
    return;
  }
  for (const child of value) collectCoordinates(child, out);
}

// Bounds are CRS84, so resx/resy are interpreted in degrees. The previous
// `resx: 10, resy: 10` produced pixels far above Copernicus' 1500 m limit and
// the Statistics API rejected the request. Use ~10 m expressed in degrees.
function resolutionDegrees(feature: ParcelGeometry, meters = 10) {
  const points: Array<[number, number]> = [];
  collectCoordinates(feature.geometry.coordinates, points);
  const avgLat = points.length ? points.reduce((sum, p) => sum + p[1], 0) / points.length : 39;
  const latDegrees = meters / 111_320;
  const cosLat = Math.max(0.2, Math.cos((avgLat * Math.PI) / 180));
  const lonDegrees = meters / (111_320 * cosLat);
  return { resx: Number(lonDegrees.toFixed(8)), resy: Number(latDegrees.toFixed(8)) };
}

async function getAccessToken() {
  const clientId = Deno.env.get('COPERNICUS_CLIENT_ID')?.trim();
  const clientSecret = Deno.env.get('COPERNICUS_CLIENT_SECRET')?.trim();
  if (!clientId || !clientSecret) {
    throw new Error('Copernicus kimlik bilgileri bulunamadı.');
  }

  const body = new URLSearchParams();
  body.set('grant_type', 'client_credentials');
  body.set('client_id', clientId);
  body.set('client_secret', clientSecret);

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error('Copernicus token error:', response.status, detail);
    throw new Error('Copernicus yetkilendirmesi başarısız.');
  }

  const data = await response.json();
  if (!data?.access_token) throw new Error('Copernicus access token alınamadı.');
  return String(data.access_token);
}

function extractLatestValidDate(data: any) {
  const intervals = Array.isArray(data?.data) ? data.data : [];
  const valid = intervals.filter((item: any) => {
    const stats = item?.outputs?.default?.bands?.B0?.stats;
    if (!stats) return false;
    const sampleCount = Number(stats.sampleCount ?? 0);
    const noDataCount = Number(stats.noDataCount ?? 0);
    const mean = Number(stats.mean);
    return sampleCount > noDataCount && Number.isFinite(mean);
  });

  if (!valid.length) return null;
  const latest = valid[valid.length - 1];
  const from = String(latest?.interval?.from ?? '');
  return /^\d{4}-\d{2}-\d{2}/.test(from) ? from.slice(0, 10) : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return jsonResponse({ success: false, message: 'Sadece POST destekleniyor.' }, 405);
  }

  try {
    const body = (await req.json()) as RequestBody;
    const geometry = body.geometry;

    if (
      !geometry ||
      geometry.type !== 'Feature' ||
      !geometry.geometry ||
      !['Polygon', 'MultiPolygon'].includes(geometry.geometry.type)
    ) {
      return jsonResponse({ success: false, message: 'Geçerli parsel geometrisi gerekli.' }, 400);
    }

    const daysBack = clamp(Number(body.daysBack ?? 45), 7, 180);
    const maxCloudCoverage = clamp(Number(body.maxCloudCoverage ?? 30), 0, 100);
    const end = new Date();
    const start = new Date();
    start.setUTCDate(start.getUTCDate() - daysBack);
    const timeRange = {
      from: `${dateOnly(start)}T00:00:00Z`,
      to: `${dateOnly(end)}T23:59:59Z`,
    };
    const resolution = resolutionDegrees(geometry);

    const token = await getAccessToken();
    const response = await fetch(STATISTICS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        input: {
          bounds: makeBounds(geometry),
          data: [
            {
              type: 'sentinel-2-l2a',
              dataFilter: {
                mosaickingOrder: 'mostRecent',
                maxCloudCoverage,
              },
            },
          ],
        },
        aggregation: {
          timeRange,
          aggregationInterval: { of: 'P1D' },
          resx: resolution.resx,
          resy: resolution.resy,
          evalscript: NDVI_STATS_SCRIPT,
        },
        calculations: { default: {} },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error('Statistics API error:', response.status, detail);
      throw new Error('Sentinel-2 ölçüm tarihi alınamadı.');
    }

    const data = await response.json();
    const latestImageDate = extractLatestValidDate(data);
    const intervalCount = Array.isArray(data?.data) ? data.data.length : 0;

    return jsonResponse({
      success: true,
      latestImageDate,
      sceneDatetime: latestImageDate ? `${latestImageDate}T00:00:00Z` : null,
      cloudCoverage: null,
      sceneId: null,
      source: 'Copernicus Data Space · Sentinel-2 L2A Statistical API',
      selection: 'latest-valid-ndvi-day',
      diagnostics: {
        daysBack,
        maxCloudCoverage,
        intervalCount,
        hasValidMeasurement: Boolean(latestImageDate),
      },
    });
  } catch (error) {
    console.error('sentinel2-latest-date:', error);
    return jsonResponse({
      success: false,
      latestImageDate: null,
      message: error instanceof Error ? error.message : 'Sentinel-2 tarihi alınamadı.',
    }, 200);
  }
});
