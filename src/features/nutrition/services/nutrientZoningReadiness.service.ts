import type {
  EarthSearchNdviRelativeZone,
  EarthSearchNdviStats,
} from '../../home-map/services/earthSearchNdvi.service';
import type { NutrientDifferentialDiagnosisResult } from './nutrientDifferentialDiagnosis.service';
import type { LocalNutrientContextResult } from './localNutrientContext.service';

export type NutrientSamplingZoneRole =
  | 'investigate_lower_vigor'
  | 'reference_higher_vigor';

export type NutrientSamplingZoneCandidate = {
  area: EarthSearchNdviRelativeZone['area'];
  role: NutrientSamplingZoneRole;
  relativeStatus: EarthSearchNdviRelativeZone['status'];
  ndviMean: number;
  deltaFromFieldMean: number;
  sampleCount: number;
  reason: string;
};

export type NutrientZoningReadinessResult = {
  version: '14.6';
  fieldId: string;
  crop: string | null;
  status: 'ready_for_sampling' | 'partial' | 'needs_data';
  confidence: 'low' | 'medium' | 'high';
  spatialSignal: {
    available: boolean;
    source: 'sentinel2-ndvi-relative-grid-v1' | 'unavailable';
    sceneId: string | null;
    acquiredAt: string | null;
    ageDays: number | null;
    operationallyFresh: boolean;
    engine: 'geoblaze' | 'native-fallback' | null;
    fieldMean: number | null;
    relativeThreshold: number | null;
    validZoneCount: number;
    weakZoneCount: number;
    referenceZoneCount: number;
    mapGeometryAvailable: false;
    areaLabelsAreCoarseGridCells: true;
  };
  samplingPlan: {
    allowed: boolean;
    purpose: 'field_or_lab_verification_only';
    candidates: NutrientSamplingZoneCandidate[];
    note: string;
  };
  prescriptionGate: {
    variableRateNitrogenAllowed: false;
    numericDoseAllowed: false;
    runtimeAvailable: false;
    zonalLaboratoryEvidenceAvailable: false;
    reasonCodes: string[];
    note: string;
  };
  localContext: {
    laboratoryAvailable: boolean;
    sl2pAvailable: boolean;
    sl2pQuality: 'high' | 'medium' | 'low' | 'unknown';
    nitrogenInterpretationAllowed: boolean;
    alternativeStressLabels: string[];
  };
  evidence: string[];
  missingInputs: string[];
  guardrails: {
    ndviZoneIsNotNitrogenZone: true;
    samplingTargetIsNotPrescriptionZone: true;
    noVariableRatePrescriptionWithoutCalibratedRuntime: true;
    noNumericDoseWithoutZonalAuthority: true;
    coarseGridLabelIsNotPolygonGeometry: true;
    laboratoryAndFieldVerificationRemainRequired: true;
  };
  generatedAt: string;
};

export type NutrientZoningReadinessInput = {
  fieldId: string | number | null | undefined;
  crop?: string | null;
  ndviStats?: EarthSearchNdviStats | null;
  localContext?: LocalNutrientContextResult | null;
  differential?: NutrientDifferentialDiagnosisResult | null;
  now?: Date;
};

const MIN_ZONE_SAMPLE_COUNT = 5;
const OPERATIONAL_SCENE_FRESHNESS_DAYS = 21;

function text(value: unknown, max = 500) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function compact(values: Array<string | null | undefined>, limit = 12) {
  return [...new Set(values.map((value) => text(value)).filter(Boolean))].slice(0, limit);
}

function finite(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function ageDays(value: string | null | undefined, now: Date) {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  const diff = Math.floor((now.getTime() - parsed) / 86_400_000);
  return diff >= 0 ? diff : null;
}

function validZones(stats: EarthSearchNdviStats | null | undefined) {
  return (stats?.relativeZones ?? [])
    .filter((zone) => Number.isFinite(Number(zone.mean)))
    .filter((zone) => Number.isFinite(Number(zone.deltaFromFieldMean)))
    .filter((zone) => Number(zone.sampleCount ?? 0) >= MIN_ZONE_SAMPLE_COUNT)
    .map((zone) => ({
      ...zone,
      mean: Number(zone.mean),
      deltaFromFieldMean: Number(zone.deltaFromFieldMean),
      sampleCount: Math.max(0, Math.round(Number(zone.sampleCount ?? 0))),
    }));
}

function weakCandidates(zones: ReturnType<typeof validZones>) {
  return zones
    .filter((zone) => zone.status === 'weaker')
    .sort((a, b) => a.deltaFromFieldMean - b.deltaFromFieldMean)
    .slice(0, 3)
    .map((zone): NutrientSamplingZoneCandidate => ({
      area: zone.area,
      role: 'investigate_lower_vigor',
      relativeStatus: zone.status,
      ndviMean: Number(zone.mean.toFixed(4)),
      deltaFromFieldMean: Number(zone.deltaFromFieldMean.toFixed(4)),
      sampleCount: zone.sampleCount,
      reason:
        `Gerçek Sentinel-2 NDVI ortalaması parsel ortalamasından ${Math.abs(zone.deltaFromFieldMean).toFixed(2)} daha düşük. ` +
        'Bu yalnız nerede kontrol/örnekleme yapılacağını daraltır; nedeni azot olarak belirlemez.',
    }));
}

function referenceCandidate(zones: ReturnType<typeof validZones>) {
  const candidate = zones
    .filter((zone) => zone.status === 'stronger' || zone.status === 'similar')
    .sort((a, b) => b.deltaFromFieldMean - a.deltaFromFieldMean)[0];

  if (!candidate) return null;

  return {
    area: candidate.area,
    role: 'reference_higher_vigor',
    relativeStatus: candidate.status,
    ndviMean: Number(candidate.mean.toFixed(4)),
    deltaFromFieldMean: Number(candidate.deltaFromFieldMean.toFixed(4)),
    sampleCount: candidate.sampleCount,
    reason:
      candidate.status === 'stronger'
        ? `Karşılaştırma örneği için parsel ortalamasından ${Math.abs(candidate.deltaFromFieldMean).toFixed(2)} daha yüksek NDVI gösteren bölge.`
        : 'Karşılaştırma örneği için parsel ortalamasına yakın NDVI gösteren bölge.',
  } satisfies NutrientSamplingZoneCandidate;
}

function alternativeStressLabels(
  differential: NutrientDifferentialDiagnosisResult | null | undefined,
) {
  if (!differential?.triggered) return [];
  return differential.causes
    .filter((cause) => cause.key !== 'nitrogen')
    .filter((cause) => cause.strength === 'strong' || cause.strength === 'moderate')
    .map((cause) => text(cause.label, 100))
    .filter(Boolean);
}

/**
 * 14.6 — Yerel/zonlu gübreleme runtime kapısı.
 *
 * Bu katman variable-rate reçete üretmez. Mevcut gerçek 3×3 Sentinel-2 NDVI
 * göreli bölgelerini yalnız saha/toprak/yaprak örnekleme hedefi olarak kullanır.
 * STICS / ICAR / HaFAS için canlı ve kalibre edilmiş runtime olmadığı sürece
 * "gübre zonu", kg/da N veya uygulama haritası üretmek yasaktır.
 */
export function buildNutrientZoningReadiness(
  input: NutrientZoningReadinessInput,
): NutrientZoningReadinessResult {
  const now = input.now ?? new Date();
  const fieldId = text(input.fieldId, 120);
  const crop = text(input.crop, 120) || null;
  const ndvi = input.ndviStats ?? null;
  const local = input.localContext ?? null;
  const zones = validZones(ndvi);
  const weak = weakCandidates(zones);
  const reference = referenceCandidate(zones);
  const sceneAgeDays = ageDays(ndvi?.datetime, now);
  const operationallyFresh =
    sceneAgeDays != null && sceneAgeDays <= OPERATIONAL_SCENE_FRESHNESS_DAYS;
  const spatialAvailable = Boolean(
    ndvi?.sceneId &&
      zones.length >= 3 &&
      weak.length > 0 &&
      reference,
  );
  const samplingAllowed = spatialAvailable && operationallyFresh;
  const alternatives = alternativeStressLabels(input.differential);
  const laboratoryAvailable = local?.authority.laboratoryAvailable === true;
  const sl2pAvailable = local?.biophysics.available === true;
  const sl2pQuality = local?.biophysics.quality ?? 'unknown';
  const nitrogenInterpretationAllowed =
    input.differential?.nitrogenGate?.nitrogenInterpretationAllowed === true;

  const candidates = samplingAllowed
    ? [...weak, ...(reference ? [reference] : [])]
    : [];

  const status: NutrientZoningReadinessResult['status'] = samplingAllowed
    ? 'ready_for_sampling'
    : zones.length > 0 || Boolean(ndvi?.sceneId)
      ? 'partial'
      : 'needs_data';

  const confidence: NutrientZoningReadinessResult['confidence'] =
    samplingAllowed && laboratoryAvailable && sl2pAvailable && sl2pQuality !== 'low'
      ? 'high'
      : samplingAllowed && (laboratoryAvailable || sl2pAvailable)
        ? 'medium'
        : 'low';

  const prescriptionReasonCodes = compact([
    'no_calibrated_stics_icar_hafas_runtime',
    'no_zone_specific_laboratory_authority',
    'coarse_ndvi_grid_is_not_prescription_geometry',
    !laboratoryAvailable ? 'field_laboratory_analysis_missing' : null,
    !sl2pAvailable ? 'sl2p_support_missing' : null,
    alternatives.length ? 'alternative_stress_must_be_excluded' : null,
  ], 8);

  const missingInputs = compact([
    !ndvi?.sceneId ? 'sentinel2_ndvi_scene' : null,
    zones.length < 3 ? 'sufficient_ndvi_relative_zone_samples' : null,
    weak.length === 0 ? 'lower_vigor_relative_zone' : null,
    !reference ? 'reference_relative_zone' : null,
    !operationallyFresh ? 'recent_operational_ndvi_scene' : null,
    !laboratoryAvailable ? 'field_laboratory_analysis' : null,
    !sl2pAvailable ? 'sl2p_biophysical_support' : null,
    'calibrated_local_nitrogen_runtime',
    'zone_specific_laboratory_or_field_calibration',
    'prescription_grade_zone_geometry',
  ], 12);

  const evidence = compact([
    ndvi?.sceneId
      ? `Sentinel-2 NDVI göreli 3×3 bölge karşılaştırması mevcut · sahne ${ndvi.sceneId}${ndvi.datetime ? ` · ${ndvi.datetime.slice(0, 10)}` : ''}.`
      : null,
    zones.length
      ? `${zones.length} bölge yeterli piksel örneği taşıyor; ${weak.length} bölge parsel ortalamasına göre daha zayıf.`
      : null,
    samplingAllowed
      ? `Örnekleme hedefi hazır: ${candidates.map((candidate) => `${candidate.area} (${candidate.role === 'investigate_lower_vigor' ? 'inceleme' : 'referans'})`).join(' · ')}.`
      : null,
    laboratoryAvailable
      ? 'Tarla düzeyinde laboratuvar kaydı mevcut; ancak bu kayıt zon-spesifik ölçüm değildir.'
      : 'Tarla düzeyinde laboratuvar kaydı yok; zonlu besin reçetesi için ölçüm otoritesi eksik.',
    sl2pAvailable
      ? `SL2P LAI/CCC/CWC desteği mevcut${sl2pQuality !== 'unknown' ? ` · kalite ${sl2pQuality}` : ''}; yalnız destek kanıtıdır.`
      : null,
    nitrogenInterpretationAllowed
      ? 'Laboratuvar bağlamı azot yorumuna izin verse bile 3×3 NDVI bölgeleri azot zonu veya değişken doz zonu sayılmaz.'
      : 'Azot nedeni doğrulanmadı; düşük NDVI bölgeleri yalnız saha/örnekleme hedefidir.',
    alternatives.length
      ? `Alternatif stres kanıtları (${alternatives.join(' · ')}) zonlu gübre kararından önce ayrılmalıdır.`
      : null,
    'STICS / ICAR / HaFAS canlı ve kalibre edilmiş runtime olmadığı için variable-rate N reçetesi kapalıdır.',
  ], 12);

  return {
    version: '14.6',
    fieldId,
    crop,
    status,
    confidence,
    spatialSignal: {
      available: spatialAvailable,
      source: ndvi?.sceneId
        ? 'sentinel2-ndvi-relative-grid-v1'
        : 'unavailable',
      sceneId: text(ndvi?.sceneId, 180) || null,
      acquiredAt: text(ndvi?.datetime, 80) || null,
      ageDays: sceneAgeDays,
      operationallyFresh,
      engine: ndvi?.engine ?? null,
      fieldMean: finite(ndvi?.mean),
      relativeThreshold: finite(ndvi?.relativeThreshold),
      validZoneCount: zones.length,
      weakZoneCount: weak.length,
      referenceZoneCount: reference ? 1 : 0,
      mapGeometryAvailable: false,
      areaLabelsAreCoarseGridCells: true,
    },
    samplingPlan: {
      allowed: samplingAllowed,
      purpose: 'field_or_lab_verification_only',
      candidates,
      note: samplingAllowed
        ? 'Zayıf ve referans bölgeler aynı gün saha kontrolü/toprak-yaprak örneklemesi için karşılaştırılabilir. Bunlar gübre uygulama zonu değildir.'
        : 'Güncel ve yeterli gerçek mekânsal farklılık oluşmadan örnekleme hedefi üretme.',
    },
    prescriptionGate: {
      variableRateNitrogenAllowed: false,
      numericDoseAllowed: false,
      runtimeAvailable: false,
      zonalLaboratoryEvidenceAvailable: false,
      reasonCodes: prescriptionReasonCodes,
      note: '14.6 yalnız readiness ve örnekleme hedefi üretir. Kalibre edilmiş yerel model + zon-spesifik ölçüm + prescription-grade geometri olmadan gübre/N reçetesi kapalı kalır.',
    },
    localContext: {
      laboratoryAvailable,
      sl2pAvailable,
      sl2pQuality,
      nitrogenInterpretationAllowed,
      alternativeStressLabels: alternatives,
    },
    evidence,
    missingInputs,
    guardrails: {
      ndviZoneIsNotNitrogenZone: true,
      samplingTargetIsNotPrescriptionZone: true,
      noVariableRatePrescriptionWithoutCalibratedRuntime: true,
      noNumericDoseWithoutZonalAuthority: true,
      coarseGridLabelIsNotPolygonGeometry: true,
      laboratoryAndFieldVerificationRemainRequired: true,
    },
    generatedAt: now.toISOString(),
  };
}
