import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.112.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SOURCE_REPO = 'https://github.com/pdallago97/HyBRIS';
const SOURCE_COMMIT = 'f554d0efb13899588b3c6e8c27420f1d267a48de';
const SOURCE_LICENSE = 'MIT';
const LOOKBACK_DAYS = 365;
const MAX_TEMPORAL_DISTANCE_DAYS = 12;
const SMOOTHING_DAYS = 30;
const EVENT_PROMINENCE = 0.1;
const DAY_MS = 86_400_000;
const TOKEN_URL =
  'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token';
const STATISTICS_URL = 'https://sh.dataspace.copernicus.eu/statistics/v1';

type ParcelGeometry = {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: any;
};

type Observation = {
  date: string;
  value: number;
};

type FusedPoint = {
  date: string;
  index: number;
  smooth: number;
  s1Contribution: number;
  s2Contribution: number;
};

type Extremum = {
  index: number;
  date: string;
  value: number;
  prominence: number;
};

type EventType = 'sowing' | 'harvest' | 'tillage';

type EventCandidate = {
  type: EventType;
  signalDate: string;
  prominence: number;
  indexValue: number | null;
  s1Contribution: number | null;
  s2Contribution: number | null;
  confidence: 'medium' | 'low';
  uncertaintyDays: number;
  note: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateMs(value: string) {
  return Date.parse(`${value}T00:00:00Z`);
}

function daysBetween(a: string, b: string) {
  return Math.round((dateMs(b) - dateMs(a)) / DAY_MS);
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

function normalizeGeometry(value: unknown): ParcelGeometry | null {
  let raw: any = value;

  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }

  if (raw?.type === 'Feature') raw = raw.geometry;
  if (raw?.type === 'FeatureCollection') raw = raw.features?.[0]?.geometry;

  if (
    raw &&
    (raw.type === 'Polygon' || raw.type === 'MultiPolygon') &&
    Array.isArray(raw.coordinates)
  ) {
    return { type: raw.type, coordinates: raw.coordinates };
  }

  return null;
}

function collectCoordinates(value: unknown, out: Array<[number, number]>) {
  if (!Array.isArray(value)) return;
  if (
    value.length >= 2 &&
    Number.isFinite(Number(value[0])) &&
    Number.isFinite(Number(value[1]))
  ) {
    out.push([Number(value[0]), Number(value[1])]);
    return;
  }
  for (const child of value) collectCoordinates(child, out);
}

function geometryResolutionDegrees(geometry: ParcelGeometry) {
  const points: Array<[number, number]> = [];
  collectCoordinates(geometry.coordinates, points);
  const avgLat = points.length
    ? points.reduce((sum, point) => sum + point[1], 0) / points.length
    : 39;
  const meters = 10;
  const latDegrees = meters / 111_320;
  const cosLat = Math.max(0.2, Math.cos((avgLat * Math.PI) / 180));
  const lonDegrees = meters / (111_320 * cosLat);
  return {
    resx: Number(lonDegrees.toFixed(8)),
    resy: Number(latDegrees.toFixed(8)),
  };
}

function geometryCenter(geometry: ParcelGeometry) {
  const points: Array<[number, number]> = [];
  collectCoordinates(geometry.coordinates, points);
  if (!points.length) return null;
  return {
    longitude: points.reduce((sum, point) => sum + point[0], 0) / points.length,
    latitude: points.reduce((sum, point) => sum + point[1], 0) / points.length,
  };
}

function makeBounds(geometry: ParcelGeometry) {
  return {
    geometry,
    properties: {
      crs: 'http://www.opengis.net/def/crs/OGC/1.3/CRS84',
    },
  };
}

function analysisPeriod() {
  const end = new Date();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - LOOKBACK_DAYS);
  return {
    from: `${isoDate(start)}T00:00:00Z`,
    to: `${isoDate(end)}T23:59:59Z`,
  };
}

let tokenCache: { token: string; expiresAt: number } | null = null;

async function getCopernicusToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }

  const clientId =
    Deno.env.get('CDSE_CLIENT_ID')?.trim() ||
    Deno.env.get('COPERNICUS_CLIENT_ID')?.trim();
  const clientSecret =
    Deno.env.get('CDSE_CLIENT_SECRET')?.trim() ||
    Deno.env.get('COPERNICUS_CLIENT_SECRET')?.trim();

  if (!clientId || !clientSecret) {
    throw new Error('Copernicus OAuth bilgileri bulunamadı.');
  }

  const form = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.access_token) {
    throw new Error(
      `Copernicus token alınamadı (${response.status}): ${String(
        payload?.error_description ?? payload?.error ?? '',
      ).slice(0, 240)}`,
    );
  }

  const expiresIn = Math.max(60, Number(payload?.expires_in ?? 600));
  tokenCache = {
    token: String(payload.access_token),
    expiresAt: Date.now() + expiresIn * 1000,
  };
  return tokenCache.token;
}

const S2_BSI_SCRIPT = `
//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B02", "B04", "B08", "B11", "SCL", "dataMask"] }],
    output: [
      { id: "bsi", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function validPixel(scl) {
  return !(scl === 0 || scl === 1 || scl === 3 || scl === 8 || scl === 9 || scl === 10 || scl === 11);
}
function evaluatePixel(s) {
  if (s.dataMask !== 1 || !validPixel(s.SCL)) return { bsi: [0], dataMask: [0] };
  var num = (s.B11 + s.B04) - (s.B08 + s.B02);
  var den = (s.B11 + s.B04) + (s.B08 + s.B02);
  if (den === 0) return { bsi: [0], dataMask: [0] };
  return { bsi: [num / den], dataMask: [1] };
}
`;

const S1_VV_VH_SCRIPT = `
//VERSION=3
function setup() {
  return {
    input: [{ bands: ["VV", "VH", "dataMask"] }],
    output: [
      { id: "radar", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function db(linear) {
  if (linear <= 0) return -40;
  return 10 * Math.log(linear) / Math.LN10;
}
function evaluatePixel(s) {
  if (s.dataMask !== 1 || s.VV <= 0 || s.VH <= 0) {
    return { radar: [0], dataMask: [0] };
  }
  return { radar: [db(s.VV) - db(s.VH)], dataMask: [1] };
}
`;

function extractStatistics(payload: any, outputId: string): Observation[] {
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  const byDate = new Map<string, number>();

  for (const row of rows) {
    const date = String(row?.interval?.from ?? '').slice(0, 10);
    const bands = row?.outputs?.[outputId]?.bands ?? null;
    const firstBand = bands ? (Object.values(bands)[0] as any) : null;
    const stats = firstBand?.stats ?? null;
    const mean = finite(stats?.mean);
    const sampleCount = finite(stats?.sampleCount);
    const noDataCount = finite(stats?.noDataCount);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || mean === null) continue;
    if (sampleCount !== null && noDataCount !== null) {
      if (sampleCount <= noDataCount || sampleCount <= 0) continue;
      const validRatio = (sampleCount - noDataCount) / sampleCount;
      if (validRatio < 0.1) continue;
    }
    byDate.set(date, mean);
  }

  return [...byDate.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function statisticsRequest(
  token: string,
  body: Record<string, unknown>,
  label: string,
) {
  const response = await fetch(STATISTICS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      `${label} Statistical API HTTP ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`,
    );
  }
  return payload;
}

async function fetchS2Bsi(
  token: string,
  geometry: ParcelGeometry,
  period: { from: string; to: string },
) {
  const resolution = geometryResolutionDegrees(geometry);
  const payload = await statisticsRequest(
    token,
    {
      input: {
        bounds: makeBounds(geometry),
        data: [
          {
            type: 'sentinel-2-l2a',
            dataFilter: {
              maxCloudCoverage: 45,
              mosaickingOrder: 'mostRecent',
            },
          },
        ],
      },
      aggregation: {
        timeRange: period,
        aggregationInterval: { of: 'P1D' },
        resx: resolution.resx,
        resy: resolution.resy,
        evalscript: S2_BSI_SCRIPT,
      },
      calculations: { bsi: {} },
    },
    'Sentinel-2 BSI',
  );
  return extractStatistics(payload, 'bsi').filter(
    (item) => item.value >= -1.2 && item.value <= 1.2,
  );
}

type OrbitDirection = 'ASCENDING' | 'DESCENDING';

type S1SeriesResult = {
  direction: OrbitDirection;
  observations: Observation[];
  backCoeff: 'GAMMA0_TERRAIN' | 'GAMMA0_ELLIPSOID';
  preprocessing: string[];
  fallbackUsed: boolean;
};

async function fetchS1ForOrbit(
  token: string,
  geometry: ParcelGeometry,
  period: { from: string; to: string },
  orbitDirection: OrbitDirection,
  backCoeff: 'GAMMA0_TERRAIN' | 'GAMMA0_ELLIPSOID',
) {
  const resolution = geometryResolutionDegrees(geometry);
  const processing: Record<string, unknown> = {
    orthorectify: 'true',
    demInstance: 'COPERNICUS_30',
    backCoeff,
  };
  if (backCoeff === 'GAMMA0_TERRAIN') {
    processing.speckleFilter = { type: 'LEE', windowSizeX: 5, windowSizeY: 5 };
  }

  const payload = await statisticsRequest(
    token,
    {
      input: {
        bounds: makeBounds(geometry),
        data: [
          {
            type: 'sentinel-1-grd',
            dataFilter: {
              acquisitionMode: 'IW',
              polarization: 'DV',
              resolution: 'HIGH',
              orbitDirection,
              mosaickingOrder: 'mostRecent',
            },
            processing,
          },
        ],
      },
      aggregation: {
        timeRange: period,
        aggregationInterval: { of: 'P1D' },
        resx: resolution.resx,
        resy: resolution.resy,
        evalscript: S1_VV_VH_SCRIPT,
      },
      calculations: { radar: {} },
    },
    `Sentinel-1 ${orbitDirection}`,
  );
  return extractStatistics(payload, 'radar').filter(
    (item) => item.value > -5 && item.value < 40,
  );
}

async function fetchBestS1Series(
  token: string,
  geometry: ParcelGeometry,
  period: { from: string; to: string },
): Promise<S1SeriesResult> {
  const run = async (backCoeff: 'GAMMA0_TERRAIN' | 'GAMMA0_ELLIPSOID') => {
    const settled = await Promise.allSettled([
      fetchS1ForOrbit(token, geometry, period, 'ASCENDING', backCoeff),
      fetchS1ForOrbit(token, geometry, period, 'DESCENDING', backCoeff),
    ]);

    const candidates: Array<{ direction: OrbitDirection; observations: Observation[] }> = [];
    if (settled[0].status === 'fulfilled') {
      candidates.push({ direction: 'ASCENDING', observations: settled[0].value });
    }
    if (settled[1].status === 'fulfilled') {
      candidates.push({ direction: 'DESCENDING', observations: settled[1].value });
    }
    candidates.sort((a, b) => b.observations.length - a.observations.length);
    return candidates[0] ?? null;
  };

  try {
    const terrain = await run('GAMMA0_TERRAIN');
    if (terrain && terrain.observations.length) {
      return {
        ...terrain,
        backCoeff: 'GAMMA0_TERRAIN',
        preprocessing: [
          'IW dual-pol VV+VH',
          'orthorectify',
          'Copernicus DEM 30 m',
          'GAMMA0_TERRAIN',
          'Lee 5x5 speckle filter',
          'single orbit direction selected by usable observation count',
        ],
        fallbackUsed: false,
      };
    }
  } catch (error) {
    console.warn('[hybris-field-events] GAMMA0_TERRAIN kullanılamadı:', error);
  }

  const ellipsoid = await run('GAMMA0_ELLIPSOID');
  if (!ellipsoid || !ellipsoid.observations.length) {
    throw new Error('Kullanılabilir Sentinel-1 VV/VH zaman serisi bulunamadı.');
  }

  return {
    ...ellipsoid,
    backCoeff: 'GAMMA0_ELLIPSOID',
    preprocessing: [
      'IW dual-pol VV+VH',
      'orthorectify',
      'Copernicus DEM 30 m',
      'GAMMA0_ELLIPSOID fallback',
      'single orbit direction selected by usable observation count',
    ],
    fallbackUsed: true,
  };
}

function percentile(values: number[], p: number) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const rank = (Math.max(0, Math.min(100, p)) / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) return sorted[low];
  const weight = rank - low;
  return sorted[low] * (1 - weight) + sorted[high] * weight;
}

function normalizePercentiles(observations: Observation[]) {
  const values = observations.map((item) => item.value);
  const low = percentile(values, 2);
  const high = percentile(values, 98);
  if (low === null || high === null || high - low < 1e-9) return [] as Observation[];

  return observations.map((item) => ({
    date: item.date,
    value: Math.max(0, Math.min(1, (item.value - low) / (high - low))),
  }));
}

function weightedForDay(day: string, observations: Observation[]) {
  let numerator = 0;
  let weightSum = 0;
  const dayTime = dateMs(day);

  for (const observation of observations) {
    const diffDays = Math.abs(dateMs(observation.date) - dayTime) / DAY_MS;
    if (!Number.isFinite(diffDays) || diffDays > MAX_TEMPORAL_DISTANCE_DAYS) continue;
    const weight = 1 / (diffDays + 1);
    numerator += weight * observation.value;
    weightSum += weight;
  }

  return {
    value: weightSum > 0 ? numerator / weightSum : null,
    weight: weightSum,
  };
}

function centeredRolling(values: number[], windowSize: number) {
  const radiusLeft = Math.floor((windowSize - 1) / 2);
  const radiusRight = windowSize - 1 - radiusLeft;
  return values.map((_, index) => {
    const from = Math.max(0, index - radiusLeft);
    const to = Math.min(values.length - 1, index + radiusRight);
    let sum = 0;
    let count = 0;
    for (let i = from; i <= to; i += 1) {
      if (!Number.isFinite(values[i])) continue;
      sum += values[i];
      count += 1;
    }
    return count ? sum / count : values[index];
  });
}

function fuseSeries(s1Raw: Observation[], s2Raw: Observation[]) {
  const s1 = normalizePercentiles(s1Raw);
  const s2 = normalizePercentiles(s2Raw);
  if (!s1.length || !s2.length) return [] as FusedPoint[];

  const firstDate = [s1[0].date, s2[0].date].sort()[0];
  const lastDate = [s1[s1.length - 1].date, s2[s2.length - 1].date].sort().at(-1)!;
  const span = Math.max(0, daysBetween(firstDate, lastDate));
  const raw: Array<Omit<FusedPoint, 'smooth'>> = [];

  for (let dayOffset = 0; dayOffset <= span; dayOffset += 1) {
    const date = addDays(firstDate, dayOffset);
    const s1Day = weightedForDay(date, s1);
    const s2Day = weightedForDay(date, s2);
    const totalWeight = s1Day.weight + s2Day.weight;
    if (totalWeight <= 0) continue;

    const fused =
      ((s1Day.value ?? 0) * s1Day.weight + (s2Day.value ?? 0) * s2Day.weight) /
      totalWeight;

    raw.push({
      date,
      // HyBRIS BSI tabanlı seriyi bitki yönlü konvansiyona çevirmek için tersine çevirir.
      index: 1 - fused,
      s1Contribution: s1Day.weight / totalWeight,
      s2Contribution: s2Day.weight / totalWeight,
    });
  }

  const smoothFusedBeforeInvert = centeredRolling(raw.map((point) => 1 - point.index), SMOOTHING_DAYS);
  return raw.map((point, index) => ({
    ...point,
    smooth: 1 - smoothFusedBeforeInvert[index],
  }));
}

function prominenceAt(values: number[], index: number, kind: 'max' | 'min', searchRadius = 45) {
  const current = values[index];
  const left = values.slice(Math.max(0, index - searchRadius), index);
  const right = values.slice(index + 1, Math.min(values.length, index + searchRadius + 1));
  if (!left.length || !right.length) return 0;

  if (kind === 'max') {
    const leftMin = Math.min(...left);
    const rightMin = Math.min(...right);
    return Math.max(0, current - Math.max(leftMin, rightMin));
  }

  const leftMax = Math.max(...left);
  const rightMax = Math.max(...right);
  return Math.max(0, Math.min(leftMax, rightMax) - current);
}

function detectExtrema(
  series: FusedPoint[],
  field: 'index' | 'smooth',
  kind: 'max' | 'min',
  minDistanceDays: number,
  minProminence: number,
) {
  const values = series.map((point) => point[field]);
  const candidates: Extremum[] = [];

  for (let i = 1; i < values.length - 1; i += 1) {
    const prev = values[i - 1];
    const current = values[i];
    const next = values[i + 1];
    const isExtremum =
      kind === 'max'
        ? current >= prev && current > next
        : current <= prev && current < next;
    if (!isExtremum) continue;

    const prominence = prominenceAt(values, i, kind);
    if (prominence < minProminence) continue;
    candidates.push({
      index: i,
      date: series[i].date,
      value: current,
      prominence,
    });
  }

  // scipy.signal.find_peaks(distance=...) davranışına yakın olacak şekilde
  // belirgin olayları önce tutup birbirine fazla yakın adayları eliyoruz.
  const selected: Extremum[] = [];
  for (const candidate of [...candidates].sort((a, b) => b.prominence - a.prominence)) {
    if (
      selected.some(
        (item) => Math.abs(daysBetween(item.date, candidate.date)) < minDistanceDays,
      )
    ) {
      continue;
    }
    selected.push(candidate);
  }
  return selected.sort((a, b) => a.date.localeCompare(b.date));
}

function nearestBefore(items: Extremum[], date: string) {
  return [...items].reverse().find((item) => item.date < date) ?? null;
}

function nearestAfter(items: Extremum[], date: string) {
  return items.find((item) => item.date > date) ?? null;
}

function pointForDate(series: FusedPoint[], date: string) {
  return series.find((point) => point.date === date) ?? null;
}

function eventConfidence(point: FusedPoint | null, prominence: number): 'medium' | 'low' {
  if (!point) return 'low';
  const dualSensor = point.s1Contribution >= 0.2 && point.s2Contribution >= 0.2;
  return dualSensor && prominence >= 0.15 ? 'medium' : 'low';
}

function eventNote(type: EventType) {
  if (type === 'sowing') {
    return 'Hibrit uydu zaman serisinde ekim/çıkış öncesi döneme uyumlu minimum sinyal; gerçek ekim kaydı değildir.';
  }
  if (type === 'harvest') {
    return 'Hibrit uydu zaman serisinde hasat dönemine uyumlu ani minimum sinyal; gerçek hasat kaydı değildir.';
  }
  return 'Aktif büyüme dönemi dışında yüzey değişimine uyumlu toprak işleme adayı; sürüm yapıldığını tek başına kanıtlamaz.';
}

function buildEvents(series: FusedPoint[]) {
  const peaks = detectExtrema(series, 'smooth', 'max', 60, EVENT_PROMINENCE);
  const sowingMinima = detectExtrema(series, 'smooth', 'min', 15, EVENT_PROMINENCE);
  const harvestMinima = detectExtrema(series, 'index', 'min', 15, EVENT_PROMINENCE);
  // Kaynak akış tillage için 0'a kadar prominence kabul edebiliyor; TarlaPusula Faz 1
  // yanlış pozitifleri azaltmak için muhafazakâr biçimde >=0.10 kullanır.
  const tillageMinima = detectExtrema(series, 'index', 'min', 30, EVENT_PROMINENCE);

  const seasons: Array<{ sowing: Extremum; peak: Extremum; harvest: Extremum }> = [];
  const sowingUsed = new Set<string>();
  const harvestUsed = new Set<string>();

  for (const peak of peaks) {
    const sowing = nearestBefore(sowingMinima, peak.date);
    const harvest = nearestAfter(harvestMinima, peak.date);
    if (!sowing || !harvest) continue;
    const seasonLength = daysBetween(sowing.date, harvest.date);
    if (seasonLength < 25 || seasonLength > 330) continue;
    const sowKey = `${sowing.date}:${sowing.index}`;
    const harvKey = `${harvest.date}:${harvest.index}`;
    if (sowingUsed.has(sowKey) || harvestUsed.has(harvKey)) continue;
    sowingUsed.add(sowKey);
    harvestUsed.add(harvKey);
    seasons.push({ sowing, peak, harvest });
  }

  const events: EventCandidate[] = [];
  const addEvent = (type: EventType, item: Extremum) => {
    const point = pointForDate(series, item.date);
    events.push({
      type,
      signalDate: item.date,
      prominence: Number(item.prominence.toFixed(4)),
      indexValue: point ? Number(point.index.toFixed(4)) : null,
      s1Contribution: point ? Number(point.s1Contribution.toFixed(4)) : null,
      s2Contribution: point ? Number(point.s2Contribution.toFixed(4)) : null,
      confidence: eventConfidence(point, item.prominence),
      uncertaintyDays: 28,
      note: eventNote(type),
    });
  };

  for (const season of seasons) {
    addEvent('sowing', season.sowing);
    addEvent('harvest', season.harvest);
  }

  for (const tillage of tillageMinima) {
    const insideGrowingSeason = seasons.some(
      (season) => tillage.date > season.sowing.date && tillage.date < season.harvest.date,
    );
    const coincidesWithBoundary = seasons.some(
      (season) => tillage.date === season.sowing.date || tillage.date === season.harvest.date,
    );
    if (insideGrowingSeason && !coincidesWithBoundary) continue;
    addEvent('tillage', tillage);
  }

  const unique = new Map<string, EventCandidate>();
  for (const event of events) {
    const key = `${event.type}:${event.signalDate}`;
    const existing = unique.get(key);
    if (!existing || event.prominence > existing.prominence) unique.set(key, event);
  }

  return [...unique.values()]
    .sort((a, b) => a.signalDate.localeCompare(b.signalDate))
    .slice(-20);
}

async function authenticate(req: Request, requestedUserId?: string | null) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const authorization = req.headers.get('Authorization') ?? '';

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) {
    throw new Error('Supabase bağlantısı veya kullanıcı oturumu eksik.');
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const cronSecret = req.headers.get('x-cron-secret')?.trim() ?? '';
  if (cronSecret && requestedUserId) {
    const { data: valid, error: secretError } = await serviceClient.rpc(
      'verify_push_dispatch_secret',
      { p_secret: cronSecret },
    );
    if (!secretError && valid === true) {
      return {
        user: { id: requestedUserId },
        serviceClient,
        internal: true,
      };
    }
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) throw new Error('Geçerli kullanıcı oturumu gerekli.');
  return { user: data.user, serviceClient, internal: false };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'Yalnız POST desteklenir.' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const fieldId = String(body?.field_id ?? '').trim();
    const requestedUserId = String(body?.user_id ?? '').trim() || null;
    if (!fieldId) return json({ ok: false, error: 'field_id gerekli.' }, 400);
    if (Object.keys(body ?? {}).some((key) => key !== 'field_id' && key !== 'user_id')) {
      return json(
        {
          ok: false,
          error: 'HyBRIS kanıtı istemciden uydu/model değeri kabul etmez.',
        },
        400,
      );
    }

    const { user, serviceClient, internal } = await authenticate(req, requestedUserId);
    if (!internal && requestedUserId && requestedUserId !== user.id) {
      return json({ ok: false, error: 'Başka kullanıcı adına HyBRIS kanıtı istenemez.' }, 403);
    }
    const { data: field, error: fieldError } = await serviceClient
      .from('fields')
      .select('id,user_id,crop,crop_cycle,parcel_geometry')
      .eq('id', fieldId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (fieldError) throw fieldError;
    if (!field) return json({ ok: false, error: 'Tarla bulunamadı veya bu kullanıcıya ait değil.' }, 404);

    const geometry = normalizeGeometry(field.parcel_geometry);
    if (!geometry) {
      return json({
        ok: true,
        field_id: fieldId,
        status: 'blocked',
        source: 'HyBRIS adapted field-event evidence',
        source_repo: SOURCE_REPO,
        source_commit: SOURCE_COMMIT,
        license: SOURCE_LICENSE,
        implementation: 'TarlaPusula TypeScript adaptation using Copernicus Data Space Sentinel Hub Statistical API',
        lookback_days: LOOKBACK_DAYS,
        max_temporal_distance_days: MAX_TEMPORAL_DISTANCE_DAYS,
        smoothing_days: SMOOTHING_DAYS,
        optical_index: 'BSI',
        event_date_meaning: 'signal-window-not-exact-operation-date',
        events: [],
        latest_event: null,
        missing_inputs: ['parcel_geometry'],
        warnings: ['Parsel geometrisi olmadan HyBRIS olay analizi yapılmadı.'],
        generated_at: new Date().toISOString(),
      });
    }

    const token = await getCopernicusToken();
    const period = analysisPeriod();
    const [s2Result, s1Result] = await Promise.allSettled([
      fetchS2Bsi(token, geometry, period),
      fetchBestS1Series(token, geometry, period),
    ]);

    const s2 = s2Result.status === 'fulfilled' ? s2Result.value : [];
    const s1 = s1Result.status === 'fulfilled' ? s1Result.value : null;
    const warnings: string[] = [];

    if (s2Result.status === 'rejected') {
      warnings.push(`Sentinel-2 BSI alınamadı: ${String(s2Result.reason?.message ?? s2Result.reason).slice(0, 220)}`);
    }
    if (s1Result.status === 'rejected') {
      warnings.push(`Sentinel-1 VV/VH alınamadı: ${String(s1Result.reason?.message ?? s1Result.reason).slice(0, 220)}`);
    }
    if (s1?.fallbackUsed) {
      warnings.push('GAMMA0_TERRAIN kullanılamadığı için radar serisi GAMMA0_ELLIPSOID fallback ile üretildi; güven yükseltilmedi.');
    }

    const s1Observations = s1?.observations ?? [];
    const allDates = [...s1Observations, ...s2].map((item) => item.date).sort();
    const startDate = allDates[0] ?? null;
    const endDate = allDates.at(-1) ?? null;
    const spanDays = startDate && endDate ? daysBetween(startDate, endDate) : 0;

    if (
      s1Observations.length < 10 ||
      s2.length < 8 ||
      spanDays < 120
    ) {
      return json({
        ok: true,
        field_id: fieldId,
        status: 'insufficient_data',
        source: 'HyBRIS adapted field-event evidence',
        source_repo: SOURCE_REPO,
        source_commit: SOURCE_COMMIT,
        license: SOURCE_LICENSE,
        implementation: 'TarlaPusula TypeScript adaptation of HyBRIS BSI + Sentinel-1 VV/VH fusion and event logic',
        lookback_days: LOOKBACK_DAYS,
        max_temporal_distance_days: MAX_TEMPORAL_DISTANCE_DAYS,
        smoothing_days: SMOOTHING_DAYS,
        s1_observation_count: s1Observations.length,
        s2_observation_count: s2.length,
        selected_orbit_direction: s1?.direction ?? null,
        radar_backscatter: s1?.backCoeff ?? null,
        radar_preprocessing: s1?.preprocessing ?? [],
        optical_index: 'BSI',
        event_date_meaning: 'signal-window-not-exact-operation-date',
        events: [],
        latest_event: null,
        data_coverage: {
          start_date: startDate,
          end_date: endDate,
          span_days: spanDays,
          fused_days: 0,
          dual_sensor_days: 0,
          dual_sensor_ratio: null,
        },
        missing_inputs: [
          ...(s1Observations.length < 10 ? ['sentinel1_time_series'] : []),
          ...(s2.length < 8 ? ['sentinel2_bsi_time_series'] : []),
        ],
        warnings: [
          ...warnings,
          'HyBRIS olay adayları için en az 120 günlük, iki sensörlü yeterli gözlem oluşmadan olay üretilmez.',
        ],
        generated_at: new Date().toISOString(),
      });
    }

    const fused = fuseSeries(s1Observations, s2);
    const dualSensorDays = fused.filter(
      (point) => point.s1Contribution > 0 && point.s2Contribution > 0,
    ).length;
    const dualSensorRatio = fused.length ? dualSensorDays / fused.length : null;
    const events = buildEvents(fused);
    const latestEvent = events.at(-1) ?? null;

    const center = geometryCenter(geometry);
    const finalWarnings = [
      ...warnings,
      'Olay tarihi, kesin traktör/ekim/hasat günü değil; yaklaşık uydu sinyal penceresidir.',
      'Radar sinyali toprak nemi, yüzey pürüzlülüğü, bitki yapısı ve görüntü geometrisinden birlikte etkilenir.',
      'Parsel ortalama sinyalidir; parsel içindeki kısmi işlemleri veya küçük alanları kaçırabilir.',
      'Kullanıcının doğrulanmış Ekim/Dikim, Hasat veya Toprak İşleme kaydı varsa bu uzaktan algılama adayından üstündür.',
      'Bu Faz 1, HyBRIS yönteminin Copernicus Data Space üzerinde TypeScript uyarlamasıdır; scipy/gee_s1_ard referans uygulamasının birebir çalıştırılması değildir.',
      center
        ? `Parsel merkez bağlamı yaklaşık ${center.latitude.toFixed(4)}, ${center.longitude.toFixed(4)}; olay hesabı nokta değil parsel geometrisi üzerinde yapılır.`
        : 'Parsel merkezi türetilemedi.',
    ];

    return json({
      ok: true,
      field_id: fieldId,
      status: events.length ? 'ready' : 'insufficient_data',
      source: 'HyBRIS adapted field-event evidence',
      source_repo: SOURCE_REPO,
      source_commit: SOURCE_COMMIT,
      license: SOURCE_LICENSE,
      implementation: 'TarlaPusula TypeScript adaptation of HyBRIS: normalized Sentinel-2 BSI + Sentinel-1 VV/VH, ±12-day weighted daily fusion, 30-day smoothing, conservative event minima/maxima',
      lookback_days: LOOKBACK_DAYS,
      max_temporal_distance_days: MAX_TEMPORAL_DISTANCE_DAYS,
      smoothing_days: SMOOTHING_DAYS,
      s1_observation_count: s1Observations.length,
      s2_observation_count: s2.length,
      selected_orbit_direction: s1?.direction ?? null,
      radar_backscatter: s1?.backCoeff ?? null,
      radar_preprocessing: s1?.preprocessing ?? [],
      optical_index: 'BSI',
      event_date_meaning: 'signal-window-not-exact-operation-date',
      events: events.map((event) => ({
        type: event.type,
        signal_date: event.signalDate,
        uncertainty_days: event.uncertaintyDays,
        prominence: event.prominence,
        confidence: event.confidence,
        index_value: event.indexValue,
        s1_contribution: event.s1Contribution,
        s2_contribution: event.s2Contribution,
        note: event.note,
      })),
      latest_event: latestEvent
        ? {
            type: latestEvent.type,
            signal_date: latestEvent.signalDate,
            uncertainty_days: latestEvent.uncertaintyDays,
            prominence: latestEvent.prominence,
            confidence: latestEvent.confidence,
            index_value: latestEvent.indexValue,
            s1_contribution: latestEvent.s1Contribution,
            s2_contribution: latestEvent.s2Contribution,
            note: latestEvent.note,
          }
        : null,
      data_coverage: {
        start_date: fused[0]?.date ?? startDate,
        end_date: fused.at(-1)?.date ?? endDate,
        span_days: fused.length > 1 ? daysBetween(fused[0].date, fused.at(-1)!.date) : spanDays,
        fused_days: fused.length,
        dual_sensor_days: dualSensorDays,
        dual_sensor_ratio: dualSensorRatio == null ? null : Number(dualSensorRatio.toFixed(4)),
      },
      missing_inputs: [],
      warnings: finalWarnings,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'HyBRIS tarla olay analizi oluşturulamadı.';
    console.error('[hybris-field-events]', message);
    return json({ ok: false, error: message }, /oturum|kullanıcı/i.test(message) ? 401 : 500);
  }
});
