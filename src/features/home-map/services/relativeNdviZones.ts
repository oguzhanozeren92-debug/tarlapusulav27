import type {
  EarthSearchNdviRelativeZone,
  EarthSearchNdviRelativeZoneStatus,
} from './earthSearchNdvi.service';

const AREA_ORDER: EarthSearchNdviRelativeZone['area'][] = [
  'kuzeybatı',
  'kuzey',
  'kuzeydoğu',
  'batı',
  'merkez',
  'doğu',
  'güneybatı',
  'güney',
  'güneydoğu',
];

function areaOrder(area: EarthSearchNdviRelativeZone['area']) {
  const index = AREA_ORDER.indexOf(area);
  return index >= 0 ? index : AREA_ORDER.length;
}

/**
 * Tek kanonik NDVI göreli-fark kaynağı.
 *
 * - Yalnız gerçek Sentinel-2 3×3 relativeZones verisini kabul eder.
 * - Yalnız status === "weaker" alanları döndürür.
 * - Aynı alanı iki kez göstermez.
 * - Alan sayısını yapay biçimde 3/6 ile sınırlamaz.
 * - Önce en negatif NDVI farkını gösterir.
 */
export function weakerRelativeNdviZones(
  zones: EarthSearchNdviRelativeZone[] | null | undefined,
): EarthSearchNdviRelativeZone[] {
  const byArea = new Map<
    EarthSearchNdviRelativeZone['area'],
    EarthSearchNdviRelativeZone
  >();

  for (const zone of Array.isArray(zones) ? zones : []) {
    if (!zone || zone.status !== 'weaker' || !zone.area) continue;

    const current = byArea.get(zone.area);
    if (
      !current ||
      Number(zone.deltaFromFieldMean) < Number(current.deltaFromFieldMean)
    ) {
      byArea.set(zone.area, zone);
    }
  }

  return Array.from(byArea.values()).sort((a, b) => {
    const aDelta = Number(a.deltaFromFieldMean);
    const bDelta = Number(b.deltaFromFieldMean);
    const aFinite = Number.isFinite(aDelta);
    const bFinite = Number.isFinite(bDelta);

    if (aFinite && bFinite && aDelta !== bDelta) return aDelta - bDelta;
    if (aFinite !== bFinite) return aFinite ? -1 : 1;
    return areaOrder(a.area) - areaOrder(b.area);
  });
}

export function findRelativeNdviZone(
  zones: EarthSearchNdviRelativeZone[] | null | undefined,
  area: string | null | undefined,
  status?: EarthSearchNdviRelativeZoneStatus,
) {
  const normalized = String(area ?? '').trim().toLocaleLowerCase('tr-TR');
  if (!normalized) return null;

  return (
    (Array.isArray(zones) ? zones : []).find((zone) => {
      if (!zone) return false;
      if (status && zone.status !== status) return false;
      return zone.area.toLocaleLowerCase('tr-TR') === normalized;
    }) ?? null
  );
}

export function weakerRelativeNdviAreas(
  zones: EarthSearchNdviRelativeZone[] | null | undefined,
) {
  return weakerRelativeNdviZones(zones).map((zone) => zone.area);
}
