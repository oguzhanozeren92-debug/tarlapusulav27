import {
  area as turfArea,
  booleanPointInPolygon,
  booleanWithin,
  point as turfPoint,
  polygon as turfPolygon,
} from '@turf/turf';
import { supabase } from '../../../supabaseClient';
import type {
  OrchardTrackingZoneInsight,
  OrchardTrackingZonePolygon,
  OrchardTrackingZoneRecord,
  OrchardTrackingZoneSaveInput,
  OrchardTrackingZoneTreeCountSource,
} from '../types/orchardTrackingZone';

export const ORCHARD_TRACKING_ZONES_CHANGED_EVENT =
  'tp:orchard-tracking-zones-changed';
export const ORCHARD_TRACKING_ZONE_START_DRAW_EVENT =
  'tp:orchard-zone-start-draw';
export const ORCHARD_TRACKING_ZONE_FOCUS_EVENT =
  'tp:orchard-zone-focus';
export const ORCHARD_TRACKING_ZONE_SELECT_EVENT =
  'tp:orchard-zone-select';

const LOCAL_KEY_PREFIX = 'tarlapusula:orchard-tracking-zones:v1:';

type NdviLike = {
  datetime?: string | null;
  mean?: number | null;
  sampleCount?: number | null;
  healthyPercent?: number | null;
  moderatePercent?: number | null;
  stressedPercent?: number | null;
  relativeThreshold?: number | null;
  engine?: string | null;
} | null | undefined;

function finiteOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function integerOrNull(value: unknown) {
  const number = finiteOrNull(value);
  return number === null ? null : Math.max(0, Math.round(number));
}

function relationMissing(error: any) {
  const code = String(error?.code ?? '');
  const message = String(error?.message ?? '');
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    /orchard_tracking_zones.*does not exist/i.test(message) ||
    /could not find.*orchard_tracking_zones/i.test(message)
  );
}

function storageKey(fieldId: string) {
  return `${LOCAL_KEY_PREFIX}${fieldId}`;
}

function normalizeLngLat(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const lng = Number(value[0]);
  const lat = Number(value[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;
  return [lng, lat];
}

function samePoint(a: number[], b: number[]) {
  return Number(a?.[0]) === Number(b?.[0]) && Number(a?.[1]) === Number(b?.[1]);
}

export function normalizeTrackingZonePolygon(
  source: unknown,
): OrchardTrackingZonePolygon | null {
  const raw: any = (source as any)?.type === 'Feature'
    ? (source as any).geometry
    : source;
  if (!raw) return null;

  if (raw.type === 'Polygon' && Array.isArray(raw.coordinates?.[0])) {
    const ring = raw.coordinates[0]
      .map(normalizeLngLat)
      .filter(Boolean) as [number, number][];
    if (ring.length < 3) return null;
    const closed = [...ring];
    if (!samePoint(closed[0], closed[closed.length - 1])) closed.push([...closed[0]] as [number, number]);
    if (closed.length < 4) return null;
    return { type: 'Polygon', coordinates: [closed] };
  }

  if (Array.isArray(raw) && Array.isArray(raw[0])) {
    const ringSource =
      typeof raw?.[0]?.[0] === 'number' ? raw : raw[0];
    const ring = ringSource
      .map(normalizeLngLat)
      .filter(Boolean) as [number, number][];
    if (ring.length < 3) return null;
    const closed = [...ring];
    if (!samePoint(closed[0], closed[closed.length - 1])) closed.push([...closed[0]] as [number, number]);
    return { type: 'Polygon', coordinates: [closed] };
  }

  return null;
}

export function buildTrackingZonePolygon(
  points: Array<[number, number]>,
): OrchardTrackingZonePolygon | null {
  if (!Array.isArray(points) || points.length < 3) return null;
  return normalizeTrackingZonePolygon({
    type: 'Polygon',
    coordinates: [[...points, points[0]]],
  });
}

export function trackingZoneAreaM2(geometry: unknown) {
  const polygon = normalizeTrackingZonePolygon(geometry);
  if (!polygon) return 0;
  try {
    return Math.max(0, turfArea(turfPolygon(polygon.coordinates)));
  } catch {
    return 0;
  }
}

export function trackingZoneAreaDecare(geometry: unknown) {
  return trackingZoneAreaM2(geometry) / 1000;
}

export function isTrackingZonePointInsideField(
  fieldGeometry: unknown,
  lngLat: [number, number],
) {
  const point = turfPoint(lngLat);
  const raw: any = (fieldGeometry as any)?.type === 'Feature'
    ? (fieldGeometry as any).geometry
    : (fieldGeometry as any)?.geometry ?? fieldGeometry;

  try {
    if (raw?.type === 'Polygon' && Array.isArray(raw.coordinates)) {
      return booleanPointInPolygon(point, turfPolygon(raw.coordinates));
    }
    if (raw?.type === 'MultiPolygon' && Array.isArray(raw.coordinates)) {
      return raw.coordinates.some((coordinates: number[][][]) =>
        booleanPointInPolygon(point, turfPolygon(coordinates)),
      );
    }
  } catch {
    return false;
  }
  return false;
}


export function isTrackingZonePolygonInsideField(
  zoneGeometry: unknown,
  fieldGeometry: unknown,
) {
  const zone = normalizeTrackingZonePolygon(zoneGeometry);
  const raw: any = (fieldGeometry as any)?.type === 'Feature'
    ? (fieldGeometry as any).geometry
    : (fieldGeometry as any)?.geometry ?? fieldGeometry;
  if (!zone || !raw) return false;

  try {
    const zoneFeature = turfPolygon(zone.coordinates);
    if (raw.type === 'Polygon' && Array.isArray(raw.coordinates)) {
      return booleanWithin(zoneFeature, turfPolygon(raw.coordinates));
    }
    if (raw.type === 'MultiPolygon' && Array.isArray(raw.coordinates)) {
      return raw.coordinates.some((coordinates: number[][][]) =>
        booleanWithin(zoneFeature, turfPolygon(coordinates)),
      );
    }
  } catch {
    return false;
  }
  return false;
}

export function estimateTreeCountFromSpacing(input: {
  areaM2: number;
  rowSpacingM: number | null | undefined;
  treeSpacingM: number | null | undefined;
}) {
  const areaM2 = finiteOrNull(input.areaM2);
  const row = finiteOrNull(input.rowSpacingM);
  const tree = finiteOrNull(input.treeSpacingM);
  if (!areaM2 || !row || !tree || areaM2 <= 0 || row <= 0 || tree <= 0) {
    return null;
  }
  const theoretical = areaM2 / (row * tree);
  if (!Number.isFinite(theoretical) || theoretical <= 0) return null;
  return Math.max(1, Math.round(theoretical));
}

function readLocal(fieldId: string): OrchardTrackingZoneRecord[] {
  try {
    const raw = localStorage.getItem(storageKey(fieldId));
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({ ...item, storageMode: 'local' as const }))
      .filter((item) => item?.fieldId === fieldId && item?.geometry?.type === 'Polygon');
  } catch {
    return [];
  }
}

function writeLocal(fieldId: string, zones: OrchardTrackingZoneRecord[]) {
  localStorage.setItem(
    storageKey(fieldId),
    JSON.stringify(zones.map((item) => ({ ...item, storageMode: 'local' }))),
  );
}

function rowToRecord(row: any): OrchardTrackingZoneRecord {
  const geometry = normalizeTrackingZonePolygon(row.geometry);
  if (!geometry) throw new Error('Takip bölgesi geometrisi geçersiz.');
  return {
    id: String(row.id),
    fieldId: String(row.field_id),
    name: String(row.name ?? 'Takip Alanı').trim() || 'Takip Alanı',
    geometry,
    areaM2: finiteOrNull(row.area_m2) ?? trackingZoneAreaM2(geometry),
    estimatedTreeCount: integerOrNull(row.estimated_tree_count),
    treeCountSource: String(row.tree_count_source ?? 'unknown') as OrchardTrackingZoneTreeCountSource,
    rowSpacingM: finiteOrNull(row.row_spacing_m),
    treeSpacingM: finiteOrNull(row.tree_spacing_m),
    notes: row.notes ? String(row.notes) : null,
    storageMode: 'cloud',
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? row.created_at ?? ''),
  };
}

async function currentUserId() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.user?.id ? String(data.session.user.id) : null;
}

export async function listOrchardTrackingZones(
  fieldIdInput: unknown,
): Promise<OrchardTrackingZoneRecord[]> {
  const fieldId = String(fieldIdInput ?? '').trim();
  if (!fieldId) return [];
  const local = typeof localStorage === 'undefined' ? [] : readLocal(fieldId);

  const { data, error } = await supabase
    .from('orchard_tracking_zones')
    .select('*')
    .eq('field_id', fieldId)
    .order('created_at', { ascending: true });

  if (error) {
    if (relationMissing(error)) return local;
    throw error;
  }

  const cloud = (data ?? []).map(rowToRecord);
  const seen = new Set(cloud.map((item) => item.id));
  return [...cloud, ...local.filter((item) => !seen.has(item.id))];
}

export async function saveOrchardTrackingZone(
  input: OrchardTrackingZoneSaveInput,
): Promise<OrchardTrackingZoneRecord> {
  const fieldId = String(input.fieldId ?? '').trim();
  const name = String(input.name ?? '').trim();
  const geometry = normalizeTrackingZonePolygon(input.geometry);
  if (!fieldId) throw new Error('Tarla seçimi bulunamadı.');
  if (!name) throw new Error('Takip alanına bir isim ver.');
  if (!geometry) throw new Error('En az 3 köşeli geçerli bir alan çiz.');

  const areaM2 = trackingZoneAreaM2(geometry);
  if (!(areaM2 > 0)) throw new Error('Seçilen alan hesaplanamadı.');

  const rowSpacingM = finiteOrNull(input.rowSpacingM);
  const treeSpacingM = finiteOrNull(input.treeSpacingM);
  const source = input.treeCountSource ?? 'unknown';
  const spacingEstimate = source === 'spacing'
    ? estimateTreeCountFromSpacing({ areaM2, rowSpacingM, treeSpacingM })
    : null;
  const estimatedTreeCount = source === 'manual'
    ? integerOrNull(input.estimatedTreeCount)
    : source === 'spacing'
      ? spacingEstimate
      : integerOrNull(input.estimatedTreeCount);

  const userId = await currentUserId();
  const payload = {
    user_id: userId,
    field_id: fieldId,
    name,
    geometry,
    area_m2: areaM2,
    estimated_tree_count: estimatedTreeCount,
    tree_count_source: source,
    row_spacing_m: rowSpacingM,
    tree_spacing_m: treeSpacingM,
    notes: String(input.notes ?? '').trim() || null,
    updated_at: new Date().toISOString(),
  };

  if (userId) {
    const { data, error } = await supabase
      .from('orchard_tracking_zones')
      .insert(payload)
      .select('*')
      .single();

    if (!error && data) return rowToRecord(data);
    if (error && !relationMissing(error)) throw error;
  }

  if (typeof localStorage === 'undefined') {
    throw new Error('Takip alanı saklanamadı.');
  }

  const now = new Date().toISOString();
  const record: OrchardTrackingZoneRecord = {
    id: `local:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`,
    fieldId,
    name,
    geometry,
    areaM2,
    estimatedTreeCount,
    treeCountSource: source,
    rowSpacingM,
    treeSpacingM,
    notes: String(input.notes ?? '').trim() || null,
    storageMode: 'local',
    createdAt: now,
    updatedAt: now,
  };
  const current = readLocal(fieldId);
  writeLocal(fieldId, [...current, record]);
  return record;
}

export async function deleteOrchardTrackingZone(zone: OrchardTrackingZoneRecord) {
  if (zone.storageMode === 'local' || zone.id.startsWith('local:')) {
    const current = readLocal(zone.fieldId);
    writeLocal(zone.fieldId, current.filter((item) => item.id !== zone.id));
    return;
  }

  const { error } = await supabase
    .from('orchard_tracking_zones')
    .delete()
    .eq('id', zone.id)
    .eq('field_id', zone.fieldId);
  if (error) throw error;
}

function sameSatelliteDay(a: unknown, b: unknown) {
  const left = String(a ?? '').slice(0, 10);
  const right = String(b ?? '').slice(0, 10);
  return Boolean(left && right && left === right);
}

function trNumber(value: number, digits = 2) {
  return value.toLocaleString('tr-TR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function buildOrchardTrackingZoneInsight(input: {
  zone: OrchardTrackingZoneRecord;
  zoneNdvi: NdviLike;
  fieldNdvi: NdviLike;
}): OrchardTrackingZoneInsight {
  const zoneMean = finiteOrNull(input.zoneNdvi?.mean);
  const fieldMean = finiteOrNull(input.fieldNdvi?.mean);
  const zoneDate = String(input.zoneNdvi?.datetime ?? '').trim() || null;
  const fieldDate = String(input.fieldNdvi?.datetime ?? '').trim() || null;
  const evidence: string[] = [];
  const warnings: string[] = [];

  if (zoneMean === null) {
    return {
      status: 'insufficient',
      headline: `${input.zone.name} için uydu yorumu henüz hazır değil`,
      summary:
        'Bu bölgeye ait gerçek Sentinel-2 pikselleri okunabildiğinde Pusula yalnız bu poligonu tarla geneliyle karşılaştıracak.',
      zoneNdviMean: null,
      fieldNdviMean: fieldMean,
      difference: null,
      satelliteDate: zoneDate,
      evidence,
      warnings: ['Uydu verisi yokken bölgesel sağlık sonucu uydurulmaz.'],
    };
  }

  evidence.push(
    `Seçili alan NDVI ortalaması ${trNumber(zoneMean)} (${Number(input.zoneNdvi?.sampleCount ?? 0).toLocaleString('tr-TR')} geçerli piksel).`,
  );

  if (fieldMean === null || !sameSatelliteDay(zoneDate, fieldDate)) {
    warnings.push(
      'Tarla geneliyle karşılaştırma yalnız aynı Sentinel-2 görüntü tarihinde yapılır.',
    );
    return {
      status: 'similar',
      headline: `${input.zone.name} için bölgesel ölçüm hazır`,
      summary: `Bu alanın NDVI ortalaması ${trNumber(zoneMean)}. Aynı tarihli tarla geneli ölçümü olmadığı için “daha iyi / daha zayıf” sonucu verilmiyor.`,
      zoneNdviMean: zoneMean,
      fieldNdviMean: fieldMean,
      difference: null,
      satelliteDate: zoneDate,
      evidence,
      warnings,
    };
  }

  const difference = zoneMean - fieldMean;
  const relativeThreshold = finiteOrNull(input.fieldNdvi?.relativeThreshold);
  evidence.push(`Aynı görüntüde tarla ortalaması ${trNumber(fieldMean)}; fark ${difference >= 0 ? '+' : ''}${trNumber(difference)}.`);

  if (relativeThreshold !== null && zoneMean < relativeThreshold) {
    evidence.push(`Tarla içi göreli zayıf eşik ${trNumber(relativeThreshold)}.`);
    return {
      status: 'attention',
      headline: `${input.zone.name} önce kontrol edilmeli`,
      summary:
        `Seçtiğin poligon aynı tarihli tarla verisine göre göreli zayıf eşik altında. Bu bir hastalık teşhisi değildir; Pusula bu bölgeyi saha kontrolünde öne alır.`,
      zoneNdviMean: zoneMean,
      fieldNdviMean: fieldMean,
      difference,
      satelliteDate: zoneDate,
      evidence,
      warnings: ['Uydu sinyali tek başına hastalık, besin eksikliği veya sulama arızasının nedenini söylemez.'],
    };
  }

  if (difference < 0) {
    return {
      status: 'watch',
      headline: `${input.zone.name} tarla ortalamasının altında`,
      summary:
        `Seçtiğin alanın NDVI ortalaması aynı görüntüde tarla ortalamasından düşük. Göreli zayıf eşik altında değilse bu durum takip sinyalidir; tek başına sorun teşhisi değildir.`,
      zoneNdviMean: zoneMean,
      fieldNdviMean: fieldMean,
      difference,
      satelliteDate: zoneDate,
      evidence,
      warnings,
    };
  }

  if (difference > 0) {
    return {
      status: 'stronger',
      headline: `${input.zone.name} tarla ortalamasının üzerinde`,
      summary:
        'Bu Sentinel-2 görüntüsünde seçtiğin poligon tarla ortalamasından daha yüksek NDVI gösteriyor. Pusula bunu “sağlıklı kesin” diye yorumlamaz; bölgesel karşılaştırma olarak saklar.',
      zoneNdviMean: zoneMean,
      fieldNdviMean: fieldMean,
      difference,
      satelliteDate: zoneDate,
      evidence,
      warnings,
    };
  }

  return {
    status: 'similar',
    headline: `${input.zone.name} tarla geneline yakın`,
    summary: 'Seçili alan ile aynı tarihli tarla ortalaması arasında belirgin sayısal fark görünmüyor.',
    zoneNdviMean: zoneMean,
    fieldNdviMean: fieldMean,
    difference,
    satelliteDate: zoneDate,
    evidence,
    warnings,
  };
}

export function dispatchOrchardTrackingZonesChanged(fieldId: string) {
  window.dispatchEvent(
    new CustomEvent(ORCHARD_TRACKING_ZONES_CHANGED_EVENT, {
      detail: { fieldId },
    }),
  );
}
