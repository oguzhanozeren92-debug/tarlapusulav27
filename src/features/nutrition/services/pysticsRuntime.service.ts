export type PysticsRuntimeStatus =
  | 'unconfigured'
  | 'ready'
  | 'unreachable'
  | 'incompatible';

export type PysticsRuntimeSnapshot = {
  version: '14.8';
  provider: 'pystics';
  workerConfigured: boolean;
  workerUrl: string | null;
  status: PysticsRuntimeStatus;
  runtimeAvailable: boolean;
  packageVersion: string | null;
  targetPackageVersion: '1.2.5';
  pythonVersion: string | null;
  smokeTestAvailable: boolean;
  calibratedSimulationEndpointAvailable: boolean;
  productionAuthority: false;
  turkeyWheat: {
    supportedByLibrary: boolean;
    configuredProfileId: string | null;
    configuredProfileValidated: boolean;
    validatedProfileIds: string[];
    productionRunAllowed: boolean;
    nutrientDecisionAuthorityAllowed: false;
    reasonCodes: string[];
  };
  guardrails: {
    exampleTalentIsSmokeTestOnly: true;
    pysticsIsSimplifiedSticsImplementation: true;
    workerAvailabilityIsNotTurkeyCalibration: true;
    cropModelOutputIsNotFertilizerPrescription: true;
    soilNutritionEngineRemainsProductionAuthority: true;
    noNumericNitrogenDoseFromRuntimeAdapter: true;
  };
  checkedAt: string;
};

type WorkerHealthResponse = {
  ok?: boolean;
  service?: string;
  runtime?: {
    available?: boolean;
    package_version?: string | null;
    python_version?: string | null;
  };
  capabilities?: {
    smoke_test?: boolean;
    calibrated_simulation?: boolean;
  };
  calibration?: {
    validated_turkey_wheat_profile_ids?: unknown;
  };
};

export type PysticsWeatherRow = {
  doy: number;
  temp_min: number;
  temp_max: number;
  trg: number;
  trr: number;
  co2: number;
  year?: number;
  month?: number;
  day?: number;
};

export type PysticsCalibratedRunRequest = {
  fieldId: string;
  crop: 'common_wheat';
  calibrationProfileId: string;
  weather: PysticsWeatherRow[];
  purpose: 'shadow_validation';
};

export type PysticsCalibratedRunResponse = {
  ok: true;
  mode: 'calibrated_shadow_simulation';
  production_authority: false;
  field_id: string;
  profile_id: string;
  crop: 'common_wheat';
  outputs: Record<string, unknown>;
  guardrails: string[];
};

const TARGET_VERSION = '1.2.5' as const;
const DEFAULT_TIMEOUT_MS = 6500;

function text(value: unknown, max = 500) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function envValue(key: string) {
  try {
    const env = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env;
    return text(env?.[key], 1000);
  } catch {
    return '';
  }
}

function configuredWorkerUrl() {
  return envValue('VITE_PYSTICS_WORKER_URL').replace(/\/+$/, '');
}

function configuredTurkeyWheatProfileId() {
  return envValue('VITE_PYSTICS_TR_WHEAT_PROFILE_ID') || null;
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => text(item, 180)).filter(Boolean))];
}

function emptySnapshot(status: PysticsRuntimeStatus, url: string | null): PysticsRuntimeSnapshot {
  const configuredProfileId = configuredTurkeyWheatProfileId();
  return {
    version: '14.8',
    provider: 'pystics',
    workerConfigured: Boolean(url),
    workerUrl: url,
    status,
    runtimeAvailable: false,
    packageVersion: null,
    targetPackageVersion: TARGET_VERSION,
    pythonVersion: null,
    smokeTestAvailable: false,
    calibratedSimulationEndpointAvailable: false,
    productionAuthority: false,
    turkeyWheat: {
      supportedByLibrary: true,
      configuredProfileId,
      configuredProfileValidated: false,
      validatedProfileIds: [],
      productionRunAllowed: false,
      nutrientDecisionAuthorityAllowed: false,
      reasonCodes: [
        status === 'unconfigured' ? 'pystics_worker_url_missing' : 'pystics_worker_unavailable',
        !configuredProfileId ? 'turkey_wheat_calibration_profile_not_configured' : null,
        'soil_nutrition_engine_remains_authority',
      ].filter(Boolean) as string[],
    },
    guardrails: {
      exampleTalentIsSmokeTestOnly: true,
      pysticsIsSimplifiedSticsImplementation: true,
      workerAvailabilityIsNotTurkeyCalibration: true,
      cropModelOutputIsNotFertilizerPrescription: true,
      soilNutritionEngineRemainsProductionAuthority: true,
      noNumericNitrogenDoseFromRuntimeAdapter: true,
    },
    checkedAt: new Date().toISOString(),
  };
}

function combineSignals(signal?: AbortSignal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
    },
  };
}

/**
 * 14.8 — pySTICS worker health + Türkiye buğdayı kalibrasyon kapısı.
 *
 * Runtime'ın ayakta olması production tavsiyesi vermek için yeterli değildir.
 * TarlaPusula yalnız worker'ın doğrulanmış TR-wheat profil listesinde env ile
 * seçilmiş profil varsa shadow simulation çağrısına izin verir. Bu sonuç dahi
 * soil-nutrition-engine'i override edemez ve gübre/N dozu üretmez.
 */
export async function probePysticsRuntime(
  signal?: AbortSignal,
): Promise<PysticsRuntimeSnapshot> {
  const workerUrl = configuredWorkerUrl();
  if (!workerUrl) return emptySnapshot('unconfigured', null);

  const linked = combineSignals(signal);
  try {
    const response = await fetch(`${workerUrl}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: linked.signal,
    });
    if (!response.ok) return emptySnapshot('unreachable', workerUrl);

    const data = (await response.json()) as WorkerHealthResponse;
    const packageVersion = text(data.runtime?.package_version, 60) || null;
    const runtimeAvailable = data.runtime?.available === true;
    const compatible = runtimeAvailable && packageVersion === TARGET_VERSION;
    const profileIds = stringArray(
      data.calibration?.validated_turkey_wheat_profile_ids,
    );
    const configuredProfileId = configuredTurkeyWheatProfileId();
    const configuredProfileValidated = Boolean(
      configuredProfileId && profileIds.includes(configuredProfileId),
    );
    const productionRunAllowed = Boolean(
      compatible &&
        data.capabilities?.calibrated_simulation === true &&
        configuredProfileValidated,
    );

    const reasonCodes = [
      !runtimeAvailable ? 'pystics_runtime_import_failed' : null,
      runtimeAvailable && !compatible ? 'pystics_version_mismatch' : null,
      !configuredProfileId ? 'turkey_wheat_calibration_profile_not_configured' : null,
      configuredProfileId && !configuredProfileValidated
        ? 'configured_profile_not_worker_validated'
        : null,
      !productionRunAllowed ? 'production_nutrient_use_blocked' : null,
      'soil_nutrition_engine_remains_authority',
    ].filter(Boolean) as string[];

    return {
      version: '14.8',
      provider: 'pystics',
      workerConfigured: true,
      workerUrl,
      status: compatible ? 'ready' : runtimeAvailable ? 'incompatible' : 'unreachable',
      runtimeAvailable: compatible,
      packageVersion,
      targetPackageVersion: TARGET_VERSION,
      pythonVersion: text(data.runtime?.python_version, 80) || null,
      smokeTestAvailable: data.capabilities?.smoke_test === true,
      calibratedSimulationEndpointAvailable:
        data.capabilities?.calibrated_simulation === true,
      productionAuthority: false,
      turkeyWheat: {
        supportedByLibrary: true,
        configuredProfileId,
        configuredProfileValidated,
        validatedProfileIds: profileIds,
        productionRunAllowed,
        nutrientDecisionAuthorityAllowed: false,
        reasonCodes,
      },
      guardrails: {
        exampleTalentIsSmokeTestOnly: true,
        pysticsIsSimplifiedSticsImplementation: true,
        workerAvailabilityIsNotTurkeyCalibration: true,
        cropModelOutputIsNotFertilizerPrescription: true,
        soilNutritionEngineRemainsProductionAuthority: true,
        noNumericNitrogenDoseFromRuntimeAdapter: true,
      },
      checkedAt: new Date().toISOString(),
    };
  } catch {
    return emptySnapshot('unreachable', workerUrl);
  } finally {
    linked.cleanup();
  }
}

export async function runCalibratedPysticsShadowSimulation(
  input: PysticsCalibratedRunRequest,
  runtime: PysticsRuntimeSnapshot,
  signal?: AbortSignal,
): Promise<PysticsCalibratedRunResponse> {
  const workerUrl = runtime.workerUrl;
  if (!workerUrl || !runtime.turkeyWheat.productionRunAllowed) {
    throw new Error(
      'pySTICS shadow simulation kapalı: doğrulanmış Türkiye buğdayı kalibrasyon profili ve uyumlu worker gerekli.',
    );
  }
  if (input.purpose !== 'shadow_validation' || input.crop !== 'common_wheat') {
    throw new Error('pySTICS 14.8 yalnız common_wheat shadow validation için açılmıştır.');
  }
  if (input.calibrationProfileId !== runtime.turkeyWheat.configuredProfileId) {
    throw new Error('pySTICS kalibrasyon profili worker readiness ile eşleşmiyor.');
  }

  const linked = combineSignals(signal);
  try {
    const response = await fetch(`${workerUrl}/v1/pystics/simulate-calibrated`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        field_id: input.fieldId,
        crop: input.crop,
        calibration_profile_id: input.calibrationProfileId,
        weather: input.weather,
        purpose: input.purpose,
      }),
      signal: linked.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      throw new Error(
        text(data?.detail ?? data?.error, 500) ||
          `pySTICS worker ${response.status} hatası döndürdü.`,
      );
    }
    return data as PysticsCalibratedRunResponse;
  } finally {
    linked.cleanup();
  }
}
