import { supabase } from '../../../supabaseClient';
import { calculateAllChillModels } from './chillModels';
import type {
  OrchardChillCompactContext,
  OrchardChillOfficialReference,
  OrchardChillSnapshot,
} from '../types/orchardChill';

const MGM_BISIP_URL = 'https://bisip.mgm.gov.tr/';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const memoryCache = new Map<string, { expiresAt: number; snapshot: OrchardChillSnapshot }>();

const CHILL_RELEVANT_ALIASES = [
  'badem', 'almond',
  'antep fıstığı', 'antep fistigi', 'antepfıstığı', 'antepfistigi', 'pistachio',
  'ceviz', 'walnut',
  'elma', 'apple',
  'armut', 'pear',
  'şeftali', 'seftali', 'peach',
  'kayısı', 'kayisi', 'apricot',
  'kiraz', 'cherry',
  'vişne', 'visne', 'sour cherry',
  'erik', 'plum',
  'fındık', 'findik', 'hazelnut',
  'üzüm', 'uzum', 'grape',
];

function text(value: unknown, max = 180) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalize(value: unknown) {
  return text(value)
    .toLocaleLowerCase('tr-TR')
    .replace(/[’']/g, '')
    .replace(/\s+/g, ' ');
}

function finite(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function isChillRelevantCrop(crop: unknown) {
  const normalized = normalize(crop);
  return CHILL_RELEVANT_ALIASES.some((alias) => normalized === alias || normalized.includes(alias));
}

export function resolveCurrentChillWindow(nowInput = new Date()) {
  const now = new Date(nowInput);
  const year = now.getFullYear();
  const month = now.getMonth();

  // MGM BİSİP tarih aralığını kullanıcıya bırakır. Otomatik TarlaPusula kartı için
  // yaz sıcaklıklarının Utah karşılaştırmasını anlamsız biçimde negatife sürüklememesi
  // adına 1 Ekim–30 Nisan analitik kış penceresi kullanılır. Mayıs–Eylül döneminde
  // son tamamlanan kış sezonu gösterilir; Ekim–Nisan arasında aktif sezon bugüne kadar hesaplanır.
  const startYear = month >= 9 ? year : year - 1;
  const start = `${startYear}-10-01`;
  const seasonEnd = `${startYear + 1}-04-30`;
  const today = [
    year,
    String(month + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
  const end = month >= 4 && month <= 8 ? seasonEnd : (today < seasonEnd ? today : seasonEnd);
  return { start, end };
}

function dateMs(date: string) {
  const ms = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(ms) ? ms : 0;
}

function expectedHours(start: string, end: string) {
  const delta = Math.max(0, dateMs(end) - dateMs(start));
  return Math.floor(delta / 3_600_000) + 24;
}

async function fetchJson(url: URL) {
  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`Saatlik sıcaklık verisi alınamadı (${response.status}).`);
  return response.json();
}

async function fetchArchiveHours(latitude: number, longitude: number, start: string, end: string) {
  if (dateMs(end) < dateMs(start)) return [] as Array<{ time: string; temperature: number }>;
  const url = new URL('https://archive-api.open-meteo.com/v1/archive');
  url.searchParams.set('latitude', String(latitude));
  url.searchParams.set('longitude', String(longitude));
  url.searchParams.set('start_date', start);
  url.searchParams.set('end_date', end);
  url.searchParams.set('hourly', 'temperature_2m');
  url.searchParams.set('timezone', 'Europe/Istanbul');
  const data = await fetchJson(url);
  const times = Array.isArray(data?.hourly?.time) ? data.hourly.time : [];
  const temperatures = Array.isArray(data?.hourly?.temperature_2m) ? data.hourly.temperature_2m : [];
  return times.map((time: string, index: number) => ({
    time,
    temperature: Number(temperatures[index]),
  })).filter((row: { temperature: number }) => Number.isFinite(row.temperature));
}

async function fetchRecentHours(latitude: number, longitude: number, start: string, end: string) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(latitude));
  url.searchParams.set('longitude', String(longitude));
  url.searchParams.set('hourly', 'temperature_2m');
  url.searchParams.set('timezone', 'Europe/Istanbul');
  url.searchParams.set('past_days', '14');
  url.searchParams.set('forecast_days', '1');
  const data = await fetchJson(url);
  const times = Array.isArray(data?.hourly?.time) ? data.hourly.time : [];
  const temperatures = Array.isArray(data?.hourly?.temperature_2m) ? data.hourly.temperature_2m : [];
  return times.map((time: string, index: number) => ({
    time,
    temperature: Number(temperatures[index]),
  })).filter((row: { time: string; temperature: number }) => {
    const day = row.time.slice(0, 10);
    return day >= start && day <= end && Number.isFinite(row.temperature);
  });
}

async function fetchHourlyTemperatures(latitude: number, longitude: number, start: string, end: string) {
  const endDate = new Date(`${end}T12:00:00Z`);
  const archiveEndDate = new Date(endDate);
  archiveEndDate.setUTCDate(archiveEndDate.getUTCDate() - 6);
  const archiveEnd = archiveEndDate.toISOString().slice(0, 10);

  const [archive, recent] = await Promise.all([
    fetchArchiveHours(latitude, longitude, start, archiveEnd).catch(() => []),
    fetchRecentHours(latitude, longitude, start, end).catch(() => []),
  ]);

  const byTime = new Map<string, number>();
  for (const row of [...archive, ...recent]) byTime.set(row.time, row.temperature);
  return [...byTime.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, temperature]) => temperature);
}

function unavailableOfficialReference(city?: unknown, district?: unknown): OrchardChillOfficialReference {
  return {
    status: 'unavailable',
    source: 'MGM_BISIP',
    stationId: null,
    stationName: null,
    city: text(city) || null,
    district: text(district) || null,
    latitude: null,
    longitude: null,
    elevationM: null,
    officialUrl: MGM_BISIP_URL,
    methodLabel: 'Klasik Yöntem · 0–7,2 °C',
    officialObservedHours: null,
    officialRequirementHours: null,
    officialRemainingHours: null,
    note: 'MGM BİSİP resmî referanstır. Belgelenmiş makine sorgu uç noktası olmadığı için resmî ihtiyaç/kalan değer uydurulmaz.',
  };
}

async function loadMgmReference(city?: unknown, district?: unknown): Promise<OrchardChillOfficialReference> {
  const fallback = unavailableOfficialReference(city, district);
  if (!text(city)) return fallback;
  try {
    const { data, error } = await supabase.functions.invoke('mgm-agro-evidence', {
      body: {
        mode: 'bisip_reference',
        city: text(city),
        district: text(district) || null,
      },
    });
    if (error || !data?.ok) return fallback;
    return {
      ...fallback,
      status: data.station ? 'ready' : 'unavailable',
      stationId: data.station?.id ? String(data.station.id) : null,
      stationName: text(data.station?.name) || null,
      latitude: finite(data.station?.latitude),
      longitude: finite(data.station?.longitude),
      elevationM: finite(data.station?.elevationM),
      note: data.note || fallback.note,
    };
  } catch {
    return fallback;
  }
}

async function resolveFieldContext(fieldId: string) {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error('Soğuklama hesabı için oturum gerekli.');

  const [{ data: field, error: fieldError }, { data: trees, error: treeError }] = await Promise.all([
    supabase
      .from('fields')
      .select('id,crop,crop_cycle,city,district,latitude,longitude,parcel_centroid_lat,parcel_centroid_lng')
      .eq('id', fieldId)
      .eq('user_id', auth.user.id)
      .maybeSingle(),
    supabase
      .from('orchard_trees')
      .select('variety,active')
      .eq('field_id', fieldId)
      .eq('user_id', auth.user.id)
      .eq('active', true)
      .limit(500),
  ]);

  if (fieldError) throw fieldError;
  if (!field) throw new Error('Soğuklama hesabı için tarla kaydı bulunamadı.');

  const varietyCounts = new Map<string, number>();
  if (!treeError) {
    for (const row of trees ?? []) {
      const variety = text((row as any).variety);
      if (variety) varietyCounts.set(variety, (varietyCounts.get(variety) ?? 0) + 1);
    }
  }
  const variety = [...varietyCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    crop: text((field as any).crop) || 'Bilinmeyen ürün',
    cropCycle: text((field as any).crop_cycle),
    city: text((field as any).city) || null,
    district: text((field as any).district) || null,
    latitude: finite((field as any).parcel_centroid_lat) ?? finite((field as any).latitude),
    longitude: finite((field as any).parcel_centroid_lng) ?? finite((field as any).longitude),
    variety,
  };
}

export async function loadOrchardChillSnapshot(fieldIdInput: unknown): Promise<OrchardChillSnapshot> {
  const fieldId = text(fieldIdInput, 100);
  if (!fieldId) throw new Error('Soğuklama hesabı için tarla seçilemedi.');

  const cached = memoryCache.get(fieldId);
  if (cached && cached.expiresAt > Date.now()) return cached.snapshot;

  const context = await resolveFieldContext(fieldId);
  const { start, end } = resolveCurrentChillWindow();
  const applicable = context.cropCycle === 'perennial' && isChillRelevantCrop(context.crop);

  if (!applicable) {
    const officialReference = unavailableOfficialReference(context.city, context.district);
    const snapshot: OrchardChillSnapshot = {
      version: '11.0', fieldId, crop: context.crop, variety: context.variety, applicable: false,
      status: 'not_applicable', windowStart: start, windowEnd: end,
      latitude: context.latitude, longitude: context.longitude, localMetrics: null,
      expectedHourlySamples: 0, actualHourlySamples: 0, coveragePct: null,
      officialReference, evidence: [],
      warnings: ['Soğuklama kartı yalnız yaprağını döken ve kış dinlenmesi izlenen çok yıllık ürünlerde açılır.'],
      generatedAt: new Date().toISOString(),
    };
    memoryCache.set(fieldId, { expiresAt: Date.now() + CACHE_TTL_MS, snapshot });
    return snapshot;
  }

  const officialReference = await loadMgmReference(context.city, context.district);
  const warnings: string[] = [];
  const evidence: string[] = [
    `MGM BİSİP Klasik Yöntem referansı: 0–7,2 °C arasındaki saatler soğuklama saati olarak sayılır.`,
  ];

  if (context.latitude === null || context.longitude === null) {
    const snapshot: OrchardChillSnapshot = {
      version: '11.0', fieldId, crop: context.crop, variety: context.variety, applicable: true,
      status: 'partial', windowStart: start, windowEnd: end,
      latitude: null, longitude: null, localMetrics: null,
      expectedHourlySamples: expectedHours(start, end), actualHourlySamples: 0, coveragePct: 0,
      officialReference, evidence,
      warnings: ['Tarla koordinatı olmadığı için tarla-noktası saatlik sıcaklık hesabı yapılamadı.'],
      generatedAt: new Date().toISOString(),
    };
    return snapshot;
  }

  const temperatures = await fetchHourlyTemperatures(context.latitude, context.longitude, start, end);
  const expected = expectedHours(start, end);
  const coveragePct = expected > 0 ? Math.min(100, Math.round((temperatures.length / expected) * 1000) / 10) : null;
  const localMetrics = temperatures.length ? calculateAllChillModels(temperatures) : null;

  if (!localMetrics) warnings.push('Saatlik sıcaklık serisi alınamadı; metrik üretilmedi.');
  if (coveragePct !== null && coveragePct < 90) warnings.push(`Saatlik veri kapsamı %${coveragePct}; sonuç eksik seri nedeniyle temkinli yorumlanmalı.`);
  if (context.variety) evidence.push(`Ağaç kayıtlarında en sık görülen çeşit: ${context.variety}.`);
  else warnings.push('Çeşit kaydı yok; MGM BİSİP çeşit ihtiyacıyla otomatik tamamlanma yüzdesi hesaplanmaz.');
  if (officialReference.stationName) evidence.push(`MGM istasyon referansı: ${officialReference.stationName}.`);

  const snapshot: OrchardChillSnapshot = {
    version: '11.0', fieldId, crop: context.crop, variety: context.variety, applicable: true,
    status: localMetrics && (coveragePct ?? 0) >= 90 ? 'ready' : 'partial',
    windowStart: start, windowEnd: end,
    latitude: context.latitude, longitude: context.longitude,
    localMetrics, expectedHourlySamples: expected, actualHourlySamples: temperatures.length, coveragePct,
    officialReference, evidence, warnings, generatedAt: new Date().toISOString(),
  };

  memoryCache.set(fieldId, { expiresAt: Date.now() + CACHE_TTL_MS, snapshot });
  return snapshot;
}

export function compactOrchardChillForPusula(
  snapshot: OrchardChillSnapshot | null | undefined,
): OrchardChillCompactContext | null {
  if (!snapshot || snapshot.status === 'not_applicable') return null;
  return {
    status: snapshot.status,
    crop: snapshot.crop,
    variety: snapshot.variety,
    window: `${snapshot.windowStart} → ${snapshot.windowEnd}`,
    classicHours: snapshot.localMetrics?.classicHours ?? null,
    utahUnits: snapshot.localMetrics?.utahUnits ?? null,
    chillPortions: snapshot.localMetrics?.chillPortions ?? null,
    coveragePct: snapshot.coveragePct,
    mgmStation: snapshot.officialReference.stationName,
    mgmOfficialUrl: snapshot.officialReference.officialUrl,
    note: 'Klasik saat tarla-koordinatı sıcaklık serisinden MGM BİSİP yöntemiyle hesaplanır; resmî MGM BİSİP istasyon sonucu değildir. Resmî ihtiyaç/kalan değer yoksa tamamlanma yüzdesi üretilmez.',
  };
}

export function clearOrchardChillCache(fieldIdInput?: unknown) {
  const fieldId = text(fieldIdInput, 100);
  if (fieldId) memoryCache.delete(fieldId);
  else memoryCache.clear();
}
