export type WeedSatelliteScreeningStatus =
  | 'unavailable'
  | 'screened-clear'
  | 'watch'
  | 'persistent-watch';

export type WeedSatellitePersistence =
  | 'unknown'
  | 'first-scan'
  | 'new'
  | 'persistent';

export type WeedSatelliteSpread =
  | 'unknown'
  | 'stable'
  | 'expanding'
  | 'contracting';

export type WeedSatelliteCandidateArea = {
  area: string;
  meanNdvi: number | null;
  fieldMeanNdvi: number | null;
  deltaFromFieldMean: number;
  relativeHealth: number | null;
  sampleCount: number;
};

export type WeedSatelliteScreeningSignal = {
  fieldId: string;
  status: WeedSatelliteScreeningStatus;
  sceneDate: string | null;
  stage: string | null;
  stageLabel: string | null;
  confidencePercent: number;
  strongestArea: string | null;
  candidateAreas: WeedSatelliteCandidateArea[];
  candidateAreaCount: number;
  fieldMeanNdvi: number | null;
  fieldStdDev: number | null;
  comparisonThreshold: number | null;
  persistence: WeedSatellitePersistence;
  spread: WeedSatelliteSpread;
  previousSceneDate: string | null;
  method: string;
  evidence: string[];
  reason: string;
};

type StoredSnapshot = {
  sceneDate: string;
  status: WeedSatelliteScreeningStatus;
  candidateAreas: string[];
  confidencePercent: number;
  savedAt: string;
};

const CACHE_VERSION = 'v2';
const MAX_HISTORY = 12;

function text(value: unknown, max = 180) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function finite(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function dateKey(value: unknown) {
  const raw = text(value, 40);
  if (!raw) return null;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return raw.slice(0, 10) || null;
  return new Date(parsed).toISOString().slice(0, 10);
}

function cacheKey(fieldId: string) {
  return `tp:weed-satellite-screening:${CACHE_VERSION}:${fieldId}`;
}

function readHistory(fieldId: string): StoredSnapshot[] {
  if (!fieldId || typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(cacheKey(fieldId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        sceneDate: text(item.sceneDate, 20),
        status: String(item.status ?? 'unavailable') as WeedSatelliteScreeningStatus,
        candidateAreas: Array.isArray(item.candidateAreas)
          ? item.candidateAreas.map((area: unknown) => text(area, 80)).filter(Boolean)
          : [],
        confidencePercent: Math.round(clamp(Number(item.confidencePercent) || 0, 0, 100)),
        savedAt: text(item.savedAt, 40),
      }))
      .filter((item) => item.sceneDate)
      .slice(-MAX_HISTORY);
  } catch {
    return [];
  }
}

export function readLatestWeedSatelliteScreening(
  fieldIdInput: string | number | null | undefined,
): WeedSatelliteScreeningSignal | null {
  const fieldId = text(fieldIdInput, 80);
  if (!fieldId || typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(`${cacheKey(fieldId)}:latest`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as WeedSatelliteScreeningSignal;
  } catch {
    return null;
  }
}

function previousSnapshot(fieldId: string, currentSceneDate: string | null) {
  if (!fieldId || !currentSceneDate) return null;
  const history = readHistory(fieldId);
  return (
    [...history]
      .reverse()
      .find((item) => item.sceneDate && item.sceneDate !== currentSceneDate) ?? null
  );
}

function stageSensitivity(stageInput: unknown) {
  const stage = text(stageInput, 60);

  if (
    [
      'pre_sowing',
      'establishment',
      'post_harvest',
      'dormancy',
      'bud_swell',
      'bud_break',
      'leaf_fall',
    ].includes(stage)
  ) {
    return { stage, multiplier: 1, bonus: 14, label: 'yüksek' };
  }

  if (['vegetative', 'harvest_window'].includes(stage)) {
    return { stage, multiplier: 1.25, bonus: 8, label: 'orta' };
  }

  if (
    [
      'reproductive',
      'maturation',
      'flowering',
      'fruit_set',
      'fruit_growth',
      'veraison',
    ].includes(stage)
  ) {
    return { stage, multiplier: 1.6, bonus: 2, label: 'düşük' };
  }

  return { stage: stage || null, multiplier: 1.8, bonus: 0, label: 'belirsiz' };
}

function sameAreaSet(a: string[], b: string[]) {
  const left = new Set(a.map((item) => item.toLocaleLowerCase('tr-TR')));
  const right = new Set(b.map((item) => item.toLocaleLowerCase('tr-TR')));
  let overlap = 0;
  left.forEach((item) => {
    if (right.has(item)) overlap += 1;
  });
  return overlap;
}

export function buildWeedSatelliteScreening(input: {
  fieldId: string | number | null | undefined;
  homePusulaResult?: any;
  ndviStats?: any;
  phenology?: any;
  resolvedSatelliteDate?: string | null;
}): WeedSatelliteScreeningSignal | null {
  const fieldId = text(input.fieldId, 80);
  if (!fieldId) return null;

  const result = input.homePusulaResult ?? null;
  const liveZonal = input.ndviStats ?? null;
  const resultSpatial = result?.context?.ndvi?.spatial ?? null;
  const resultZonal = result?.context?.ndvi?.zonalStats ?? result?.context?.ndvi?.zonal ?? null;
  const zonal = liveZonal ?? resultZonal;
  const liveZones = Array.isArray(liveZonal?.relativeZones)
    ? liveZonal.relativeZones
    : [];

  const liveFindings = liveZones
    .filter(
      (zone: any) =>
        zone &&
        text(zone?.area, 80) &&
        finite(zone?.mean) !== null &&
        finite(zone?.deltaFromFieldMean) !== null,
    )
    .map((zone: any) => {
      const delta = finite(zone?.deltaFromFieldMean) ?? 0;
      const relativeHealth = finite(zone?.relativeHealth);
      const relativeStatus =
        zone?.status === 'stronger' ||
        zone?.status === 'weaker' ||
        zone?.status === 'similar'
          ? zone.status
          : delta >= (finite(liveZonal?.relativeThreshold) ?? 0.04)
            ? 'stronger'
            : delta <= -(finite(liveZonal?.relativeThreshold) ?? 0.04)
              ? 'weaker'
              : 'similar';

      return {
        area: text(zone?.area, 80),
        direction: text(zone?.area, 80),
        score: relativeStatus === 'stronger'
          ? Math.min(1, Math.abs(delta) / Math.max(finite(liveZonal?.relativeThreshold) ?? 0.04, 0.000001))
          : 0,
        evidence: relativeStatus === 'stronger'
          ? ['Gerçek Sentinel-2 NDVI bölge ortalaması parsel ortalamasından yüksek']
          : [],
        ndvi: {
          mean: finite(zone?.mean),
          fieldMean: finite(liveZonal?.mean),
          deltaFromFieldMean: delta,
          relativeHealth,
          relativeStatus,
          comparisonThreshold: finite(liveZonal?.relativeThreshold) ?? 0.04,
          sampleCount: Math.max(0, Math.round(finite(zone?.sampleCount) ?? 0)),
        },
      };
    });

  const spatial = resultSpatial ?? (liveFindings.length
    ? {
        method: 'sentinel2-geoblaze-relative-grid-v2',
        comparison: 'parcel-mean',
        fieldMean: finite(liveZonal?.mean),
        threshold: finite(liveZonal?.relativeThreshold) ?? 0.04,
        findings: liveFindings,
      }
    : null);
  const findings = Array.isArray(spatial?.findings) ? spatial.findings : [];

  const sceneDate =
    dateKey(liveZonal?.datetime) ||
    dateKey(zonal?.datetime) ||
    dateKey(input.resolvedSatelliteDate) ||
    dateKey(result?.context?.ndvi?.date) ||
    null;

  const stageInfo = stageSensitivity(input.phenology?.stage);
  const stageLabel = text(input.phenology?.stageLabel, 100) || null;
  const fieldMeanNdvi = finite(spatial?.fieldMean ?? zonal?.mean ?? result?.context?.ndvi?.average);
  const fieldStdDev = finite(zonal?.stdDev ?? result?.context?.ndvi?.stdDev);
  const baseThreshold = finite(spatial?.threshold ?? zonal?.relativeThreshold) ?? 0.04;
  const threshold = Math.max(0.04, baseThreshold * stageInfo.multiplier);
  const method = text(spatial?.method, 120) || 'sentinel2-relative-zonal-screening';

  const realPixelSpatial =
    findings.length >= 3 &&
    (liveZones.length >= 3 ||
      /sentinel2|geoblaze|relative-grid/i.test(method) ||
      Array.isArray(zonal?.relativeZones));

  if (!sceneDate || !realPixelSpatial) {
    return {
      fieldId,
      status: 'unavailable',
      sceneDate,
      stage: stageInfo.stage,
      stageLabel,
      confidencePercent: 0,
      strongestArea: null,
      candidateAreas: [],
      candidateAreaCount: 0,
      fieldMeanNdvi,
      fieldStdDev,
      comparisonThreshold: threshold,
      persistence: 'unknown',
      spread: 'unknown',
      previousSceneDate: null,
      method,
      evidence: [],
      reason: 'Yabancı ot uydu taraması için yeterli gerçek parsel-içi Sentinel-2 bölge verisi yok.',
    };
  }

  const candidateAreas = findings
    .map((finding: any) => {
      const area = text(finding?.area ?? finding?.direction, 80);
      const status = text(finding?.ndvi?.relativeStatus, 30);
      const delta = finite(finding?.ndvi?.deltaFromFieldMean);
      const mean = finite(finding?.ndvi?.mean);
      const relativeHealth = finite(finding?.ndvi?.relativeHealth);
      const sampleCount = Math.max(0, Math.round(finite(finding?.ndvi?.sampleCount) ?? 0));

      if (!area || status !== 'stronger' || delta === null || delta < threshold) return null;
      if (sampleCount > 0 && sampleCount < 2) return null;

      return {
        area,
        meanNdvi: mean,
        fieldMeanNdvi,
        deltaFromFieldMean: Number(delta.toFixed(4)),
        relativeHealth,
        sampleCount,
      } satisfies WeedSatelliteCandidateArea;
    })
    .filter((item: WeedSatelliteCandidateArea | null): item is WeedSatelliteCandidateArea => Boolean(item))
    .sort((a: WeedSatelliteCandidateArea, b: WeedSatelliteCandidateArea) => b.deltaFromFieldMean - a.deltaFromFieldMean)
    .slice(0, 3);

  const previous = previousSnapshot(fieldId, sceneDate);
  const currentAreas = candidateAreas.map((item) => item.area);
  const previousAreas = previous?.candidateAreas ?? [];
  const overlap = sameAreaSet(currentAreas, previousAreas);

  let persistence: WeedSatellitePersistence = 'first-scan';
  let spread: WeedSatelliteSpread = 'unknown';

  if (previous) {
    if (candidateAreas.length && !previousAreas.length) {
      persistence = 'new';
    } else if (candidateAreas.length && overlap > 0) {
      persistence = 'persistent';
    } else if (candidateAreas.length) {
      persistence = 'new';
    }

    if (candidateAreas.length > previousAreas.length) spread = 'expanding';
    else if (candidateAreas.length < previousAreas.length) spread = 'contracting';
    else if (candidateAreas.length || previousAreas.length) spread = 'stable';
  }

  const strongest = candidateAreas[0] ?? null;
  const heterogeneityBonus = fieldStdDev !== null && fieldStdDev >= 0.08 ? 10 : fieldStdDev !== null && fieldStdDev >= 0.05 ? 5 : 0;
  const deltaBonus = strongest
    ? strongest.deltaFromFieldMean >= 0.12
      ? 16
      : strongest.deltaFromFieldMean >= 0.08
        ? 11
        : 6
    : 0;
  const persistenceBonus = persistence === 'persistent' ? 12 : persistence === 'new' ? 4 : 0;
  const spreadBonus = spread === 'expanding' ? 8 : 0;
  const confidencePercent = candidateAreas.length
    ? Math.round(clamp(38 + stageInfo.bonus + heterogeneityBonus + deltaBonus + persistenceBonus + spreadBonus, 35, 88))
    : Math.round(clamp(55 + (input.phenology?.dataStatus === 'usable' ? 8 : 0), 45, 72));

  const evidence = [
    `Gerçek Sentinel-2 NDVI pikselleri parsel içinde ${findings.length} bölge olarak karşılaştırıldı.`,
    stageLabel ? `Fenoloji: ${stageLabel}; yabancı ot için uydu seçiciliği ${stageInfo.label}.` : '',
    strongest
      ? `${strongest.area} bölgesinde NDVI parsel ortalamasından ${strongest.deltaFromFieldMean.toFixed(2)} daha yüksek.`
      : 'Fenolojiye göre anlamlı, yerel aşırı yeşillenme adayı görülmedi.',
    fieldStdDev !== null ? `Parsel içi NDVI standart sapması ${fieldStdDev.toFixed(3)}.` : '',
    persistence === 'persistent' ? 'Aynı şüpheli bölge önceki farklı uydu taramasında da görüldü.' : '',
    spread === 'expanding' ? 'Şüpheli bölge sayısı önceki taramaya göre arttı.' : '',
  ].filter(Boolean);

  const hasSuspicion = candidateAreas.length > 0;
  const persistentWatch = hasSuspicion && (persistence === 'persistent' || spread === 'expanding');

  return {
    fieldId,
    status: hasSuspicion ? (persistentWatch ? 'persistent-watch' : 'watch') : 'screened-clear',
    sceneDate,
    stage: stageInfo.stage,
    stageLabel,
    confidencePercent,
    strongestArea: strongest?.area ?? null,
    candidateAreas,
    candidateAreaCount: candidateAreas.length,
    fieldMeanNdvi,
    fieldStdDev,
    comparisonThreshold: threshold,
    persistence,
    spread,
    previousSceneDate: previous?.sceneDate ?? null,
    method,
    evidence,
    reason: hasSuspicion
      ? 'Fenolojiye göre beklenenden daha güçlü ve yerel yeşillenme deseni yabancı ot açısından saha kontrolü adayı oluşturdu.'
      : 'Uydu taraması tamamlandı; yabancı ota özgü yeterince seçici bir yerel aşırı yeşillenme deseni görülmedi.',
  };
}

export function persistWeedSatelliteScreening(signal: WeedSatelliteScreeningSignal | null | undefined) {
  if (!signal?.fieldId || !signal.sceneDate || typeof window === 'undefined') return;

  try {
    const key = cacheKey(signal.fieldId);
    const history = readHistory(signal.fieldId);
    const snapshot: StoredSnapshot = {
      sceneDate: signal.sceneDate,
      status: signal.status,
      candidateAreas: signal.candidateAreas.map((item) => item.area),
      confidencePercent: signal.confidencePercent,
      savedAt: new Date().toISOString(),
    };

    const nextHistory = [
      ...history.filter((item) => item.sceneDate !== signal.sceneDate),
      snapshot,
    ].slice(-MAX_HISTORY);

    window.localStorage.setItem(key, JSON.stringify(nextHistory));
    window.localStorage.setItem(`${key}:latest`, JSON.stringify(signal));

    window.dispatchEvent(
      new CustomEvent('tp:weed-satellite-screening-updated', {
        detail: {
          fieldId: signal.fieldId,
          sceneDate: signal.sceneDate,
          status: signal.status,
        },
      }),
    );
  } catch {
    // Yerel cache başarısızlığı karar motorunu durdurmaz.
  }
}
