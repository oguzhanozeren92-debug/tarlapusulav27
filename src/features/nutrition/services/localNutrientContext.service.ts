import type {
  BiophysicalSnapshot,
  FieldScientificSignals,
} from '../../../services/fieldScientificSignals.service';
import { buildFieldBiophysicsInsight } from '../../../services/fieldBiophysicsInsight.service';
import type { PysticsRuntimeSnapshot } from './pysticsRuntime.service';

export type LocalNutrientMethodKey =
  | 'stics-n-balance'
  | 'icar-n-zoning'
  | 'hafas-local-fertilization';

export type LocalNutrientMethodReference = {
  key: LocalNutrientMethodKey;
  label: string;
  role: 'method_reference';
  runtimeAvailable: false;
  productionAuthority: false;
  note: string;
};

export type LocalNutrientMetric = {
  value: number | null;
  trend: 'up' | 'down' | 'stable' | 'unknown';
  significant: boolean;
};

export type LocalNutrientContextResult = {
  version: '14.5';
  fieldId: string;
  crop: string | null;
  status: 'ready' | 'partial' | 'needs_data';
  authority: {
    productionEngine: 'soil-nutrition-engine';
    serverProductionAuthority: boolean;
    laboratoryAvailable: boolean;
    soilGridsRole: 'context_only' | 'unavailable';
    sl2pRole: 'supporting_only' | 'unavailable';
  };
  biophysics: {
    available: boolean;
    sceneId: string | null;
    acquiredAt: string | null;
    quality: 'high' | 'medium' | 'low' | 'unknown';
    comparisonReady: boolean;
    lai: LocalNutrientMetric;
    ccc: LocalNutrientMetric;
    cwc: LocalNutrientMetric;
    fCover: LocalNutrientMetric;
  };
  phenologyStageLabel: string | null;
  recentFertilizationCount: number;
  pysticsRuntime: PysticsRuntimeSnapshot;
  methodReferences: LocalNutrientMethodReference[];
  evidence: string[];
  missingInputs: string[];
  guardrails: {
    sl2pCannotDiagnoseNitrogen: true;
    chlorophyllTrendIsNotNitrogenDeficiency: true;
    soilGridsCannotReplaceLaboratory: true;
    methodReferenceIsNotRuntimeModel: true;
    noSyntheticSticsOutput: true;
    noSyntheticIcarZoning: true;
    noSyntheticHafasRecommendation: true;
    noNumericDoseFromContextLayer: true;
  };
  generatedAt: string;
};

export type LocalNutrientContextInput = {
  fieldId: string | number | null | undefined;
  crop?: string | null;
  laboratoryAvailable: boolean;
  soilGridsAvailable: boolean;
  serverProductionAuthority: boolean;
  recentFertilizationCount?: number | null;
  phenologyStageLabel?: string | null;
  scientificSignals?: FieldScientificSignals | null;
  pysticsRuntime?: PysticsRuntimeSnapshot | null;
  generatedAt?: string;
};

const METHOD_REFERENCES: LocalNutrientMethodReference[] = [
  {
    key: 'stics-n-balance',
    label: 'STICS azot dengesi yaklaşımı',
    role: 'method_reference',
    runtimeAvailable: false,
    productionAuthority: false,
    note: 'Yerel azot dengesi tasarım referansıdır; TarlaPusula içinde STICS runtime sonucu üretilmiş gibi gösterilmez.',
  },
  {
    key: 'icar-n-zoning',
    label: 'ICAR azot zonlama yaklaşımı',
    role: 'method_reference',
    runtimeAvailable: false,
    productionAuthority: false,
    note: 'Parsel içi zonlama yöntem referansıdır; kalibre edilmiş Türkiye modeli/runtime olmadan N zonu veya doz üretmez.',
  },
  {
    key: 'hafas-local-fertilization',
    label: 'HaFAS yerel gübreleme yaklaşımı',
    role: 'method_reference',
    runtimeAvailable: false,
    productionAuthority: false,
    note: 'Yerel öneri mantığı için yöntem referansıdır; gerçek entegrasyon ve kalibrasyon olmadan uygulama tavsiyesi sayılmaz.',
  },
];

function text(value: unknown, max = 500) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function compact(values: Array<string | null | undefined>, limit = 10) {
  return [...new Set(values.map((value) => text(value)).filter(Boolean))].slice(0, limit);
}

function finite(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function metricValue(snapshot: BiophysicalSnapshot | null, key: string) {
  const metric = snapshot?.metrics?.[key];
  return finite(metric?.value ?? metric?.mean);
}

function emptyMetric(): LocalNutrientMetric {
  return { value: null, trend: 'unknown', significant: false };
}

function localMetric(
  insight: ReturnType<typeof buildFieldBiophysicsInsight>,
  key: 'LAI' | 'CCC' | 'CWC' | 'fCOVER',
): LocalNutrientMetric {
  const trend = insight.trends[key];
  if (!trend) return emptyMetric();
  return {
    value: trend.current,
    trend: trend.direction,
    significant: trend.significant,
  };
}

function biophysicsEvidence(
  latest: BiophysicalSnapshot | null,
  insight: ReturnType<typeof buildFieldBiophysicsInsight>,
) {
  if (!latest) return [];

  const lai = localMetric(insight, 'LAI');
  const ccc = localMetric(insight, 'CCC');
  const cwc = localMetric(insight, 'CWC');
  const cover = localMetric(insight, 'fCOVER');

  return compact([
    `SL2P Sentinel-2 biyofizik ölçümü mevcut${latest.acquiredAt ? ` · ${latest.acquiredAt.slice(0, 10)}` : ''}; rolü destek sinyalidir.`,
    lai.value != null
      ? `LAI ${lai.value.toFixed(2)}${lai.trend !== 'unknown' ? ` · trend ${lai.trend}` : ''}.`
      : null,
    ccc.value != null
      ? `CCC/kanopi klorofil ${ccc.value.toFixed(2)}${ccc.trend !== 'unknown' ? ` · trend ${ccc.trend}` : ''}; klorofil değişimi tek başına azot eksikliği değildir.`
      : null,
    cwc.value != null
      ? `CWC/kanopi su içeriği ${cwc.value.toFixed(3)}${cwc.trend !== 'unknown' ? ` · trend ${cwc.trend}` : ''}; su stresi ayrımında destek bağlamıdır.`
      : null,
    cover.value != null
      ? `fCOVER ${(cover.value * 100).toFixed(0)}%${cover.trend !== 'unknown' ? ` · trend ${cover.trend}` : ''}.`
      : null,
  ], 5);
}

function defaultPysticsRuntime(): PysticsRuntimeSnapshot {
  return {
    version: '14.8', provider: 'pystics', workerConfigured: false, workerUrl: null,
    status: 'unconfigured', runtimeAvailable: false, packageVersion: null,
    targetPackageVersion: '1.2.5', pythonVersion: null, smokeTestAvailable: false,
    calibratedSimulationEndpointAvailable: false, productionAuthority: false,
    turkeyWheat: { supportedByLibrary: true, configuredProfileId: null,
      configuredProfileValidated: false, validatedProfileIds: [],
      productionRunAllowed: false, nutrientDecisionAuthorityAllowed: false,
      reasonCodes: ['pystics_worker_url_missing', 'turkey_wheat_calibration_profile_not_configured', 'soil_nutrition_engine_remains_authority'] },
    guardrails: { exampleTalentIsSmokeTestOnly: true, pysticsIsSimplifiedSticsImplementation: true,
      workerAvailabilityIsNotTurkeyCalibration: true, cropModelOutputIsNotFertilizerPrescription: true,
      soilNutritionEngineRemainsProductionAuthority: true, noNumericNitrogenDoseFromRuntimeAdapter: true },
    checkedAt: new Date().toISOString(),
  };
}

/**
 * 14.5 — Yerel gübreleme bağlamı / model hazırlık katmanı.
 *
 * Bu katman karar veya doz motoru değildir. Gerçekte mevcut kaynakları
 * (laboratuvar, SoilGrids bağlamı, SL2P LAI/CCC/CWC/fCOVER ve fenoloji)
 * tek provenance nesnesinde toplar. STICS / ICAR / HaFAS yalnız yöntem
 * referansı olarak işaretlenir; runtime yokken sonuç uydurulmaz.
 */
export function buildLocalNutrientContext(
  input: LocalNutrientContextInput,
): LocalNutrientContextResult {
  const fieldId = text(input.fieldId, 120);
  const crop = text(input.crop, 120) || null;
  const scientificSignals = input.scientificSignals ?? null;
  const latest = scientificSignals?.biophysics?.latest ?? null;
  const history = scientificSignals?.biophysics?.history ?? [];
  const insight = buildFieldBiophysicsInsight({
    history,
    cropName: crop,
    stageLabel: input.phenologyStageLabel,
  });
  const sl2pAvailable = Boolean(latest);
  const pysticsRuntime = input.pysticsRuntime ?? defaultPysticsRuntime();
  const recentFertilizationCount = Math.max(
    0,
    Math.round(finite(input.recentFertilizationCount) ?? 0),
  );

  const sourceCount = [
    input.laboratoryAvailable,
    input.soilGridsAvailable,
    sl2pAvailable,
  ].filter(Boolean).length;

  const status: LocalNutrientContextResult['status'] =
    input.laboratoryAvailable && sl2pAvailable
      ? 'ready'
      : sourceCount > 0
        ? 'partial'
        : 'needs_data';

  const missingInputs = compact([
    !input.laboratoryAvailable ? 'soil_or_leaf_lab_analysis' : null,
    !sl2pAvailable ? 'sl2p_biophysical_observation' : null,
    !input.phenologyStageLabel ? 'phenology_stage' : null,
  ], 6);

  const evidence = compact([
    input.laboratoryAvailable
      ? 'Seçili tarlaya ait laboratuvar kaydı mevcut; besin yorumunda ölçüm dayanağı olarak önceliklidir.'
      : 'Seçili tarla için laboratuvar kaydı yok; bu bağlam katmanı sayısal gübre dozu üretemez.',
    input.soilGridsAvailable
      ? 'SoilGrids arka plan bağlamı mevcut; laboratuvar ölçümü yerine geçmez.'
      : null,
    ...biophysicsEvidence(latest, insight),
    input.phenologyStageLabel
      ? `Fenoloji bağlamı: ${text(input.phenologyStageLabel, 120)}.`
      : null,
    recentFertilizationCount > 0
      ? `Besin motoru bağlamında ${recentFertilizationCount} yakın dönem gübreleme kaydı bulunuyor.`
      : null,
    pysticsRuntime.runtimeAvailable
      ? `pySTICS ${pysticsRuntime.packageVersion ?? ''} worker bağlı; rolü shadow/runtime adayıdır, besin karar otoritesi değildir.${pysticsRuntime.turkeyWheat.productionRunAllowed ? ' Doğrulanmış TR-buğday kalibrasyon profili worker tarafından tanınıyor.' : ' Türkiye buğdayı production kalibrasyon kapısı kapalı.'}`
      : 'pySTICS worker bağlı değil veya uyumlu değil; model çıktısı üretilmiş gibi gösterilmez.',
    'Resmî STICS yaklaşımı, ICAR azot zonlama ve HaFAS bu aşamada yöntem referansıdır; pySTICS runtime bunların yerine production gübre reçetesi sayılmaz.',
  ], 10);

  return {
    version: '14.5',
    fieldId,
    crop,
    status,
    authority: {
      productionEngine: 'soil-nutrition-engine',
      serverProductionAuthority: Boolean(input.serverProductionAuthority),
      laboratoryAvailable: Boolean(input.laboratoryAvailable),
      soilGridsRole: input.soilGridsAvailable ? 'context_only' : 'unavailable',
      sl2pRole: sl2pAvailable ? 'supporting_only' : 'unavailable',
    },
    biophysics: {
      available: sl2pAvailable,
      sceneId: latest?.sceneId || null,
      acquiredAt: latest?.acquiredAt || null,
      quality: insight.quality,
      comparisonReady: insight.comparisonReady,
      lai: localMetric(insight, 'LAI'),
      ccc: localMetric(insight, 'CCC'),
      cwc: localMetric(insight, 'CWC'),
      fCover: localMetric(insight, 'fCOVER'),
    },
    phenologyStageLabel: text(input.phenologyStageLabel, 120) || null,
    recentFertilizationCount,
    pysticsRuntime,
    methodReferences: METHOD_REFERENCES.map((item) => ({ ...item })),
    evidence,
    missingInputs,
    guardrails: {
      sl2pCannotDiagnoseNitrogen: true,
      chlorophyllTrendIsNotNitrogenDeficiency: true,
      soilGridsCannotReplaceLaboratory: true,
      methodReferenceIsNotRuntimeModel: true,
      noSyntheticSticsOutput: true,
      noSyntheticIcarZoning: true,
      noSyntheticHafasRecommendation: true,
      noNumericDoseFromContextLayer: true,
    },
    generatedAt: input.generatedAt ?? new Date().toISOString(),
  };
}
