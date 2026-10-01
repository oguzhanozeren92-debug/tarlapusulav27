import { supabase } from '../supabaseClient';

export type ScientificMetric = {
  value?: number | null;
  mean?: number | null;
  p10?: number | null;
  p90?: number | null;
  model_error_mean?: number | null;
  valid_fraction?: number | null;
  valid_count?: number | null;
};

export type BiophysicalSnapshot = {
  sceneId: string;
  acquiredAt: string;
  metrics: Record<string, ScientificMetric>;
  qc: Record<string, any>;
  source: Record<string, any>;
};

export type FieldScientificSignals = {
  biophysics: {
    latest: BiophysicalSnapshot | null;
    history: BiophysicalSnapshot[];
    historyCount: number;
  };
  rscm: any | null;
  dataConfidence: any | null;
};

export type ScientificRefreshStep = {
  engine: 'sl2p' | 'rscm' | 'unicrop';
  ok: boolean;
  blocked: boolean;
  error: string | null;
  missingInputs: string[];
  note: string | null;
  status: number | null;
};

export type ScientificRefreshResult = {
  signals: FieldScientificSignals;
  steps: ScientificRefreshStep[];
};


const STEP_TIMEOUT_MS = 45_000;

function friendlyScientificServiceError(value: unknown) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (/render model gateway|endpointi bulunamadı|deploy et|gateway http 404|not found/i.test(text)) {
    return 'Sentinel-2 biyofizik servisi hazırlanıyor. Kullanıcıdan işlem gerekmiyor.';
  }
  return text;
}

function isTemporaryGatewayDeploymentError(value: unknown) {
  const text = String(value ?? '').trim();
  return /render model gateway|endpointi bulunamadı|deploy et|gateway http 404|not found/i.test(text);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`${label} yanıtı uzun sürdü. Sunucu işlemi devam ediyor olabilir; biraz sonra tekrar kontrol et.`));
    }, timeoutMs);
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error) => { window.clearTimeout(timer); reject(error); },
    );
  });
}

function normalizedId(fieldId: string) {
  return String(fieldId ?? '').trim();
}

function mapSnapshot(row: any): BiophysicalSnapshot {
  return {
    sceneId: String(row?.scene_id ?? ''),
    acquiredAt: String(row?.acquired_at ?? ''),
    metrics: row?.metrics && typeof row.metrics === 'object' ? row.metrics : {},
    qc: row?.qc && typeof row.qc === 'object' ? row.qc : {},
    source: row?.source && typeof row.source === 'object' ? row.source : {},
  };
}

async function latestEngineOutput(fieldId: string, engine: 'rscm' | 'unicrop') {
  const { data, error } = await supabase
    .from('model_engine_runs')
    .select('engine,status,mode,output,completed_at,error_message,missing_inputs')
    .eq('field_id', fieldId)
    .eq('engine', engine)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.output ?? null;
}

export async function loadFieldScientificSignals(fieldId: string): Promise<FieldScientificSignals> {
  const field = normalizedId(fieldId);
  if (!field) {
    return {
      biophysics: { latest: null, history: [], historyCount: 0 },
      rscm: null,
      dataConfidence: null,
    };
  }

  const [biophysicsResult, rscmResult, confidenceResult] = await Promise.all([
    supabase
      .from('field_biophysical_snapshots')
      .select('scene_id,acquired_at,metrics,qc,source', { count: 'exact' })
      .eq('field_id', field)
      .eq('algorithm', 'sl2p')
      .order('acquired_at', { ascending: false })
      .limit(8),
    latestEngineOutput(field, 'rscm'),
    latestEngineOutput(field, 'unicrop'),
  ]);

  if (biophysicsResult.error) throw biophysicsResult.error;
  const historyRows = Array.isArray(biophysicsResult.data) ? biophysicsResult.data : [];
  const history = historyRows.map(mapSnapshot);
  const latest = history[0] ?? null;

  return {
    biophysics: {
      latest,
      history,
      historyCount: Number(biophysicsResult.count ?? history.length),
    },
    rscm: rscmResult,
    dataConfidence: confidenceResult,
  };
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? '').trim()).filter(Boolean);
}

async function payloadFromFunctionError(error: any) {
  try {
    const response = error?.context;
    if (response instanceof Response) {
      const status = response.status;
      const payload = await response.clone().json().catch(() => null);
      return { payload, status };
    }
  } catch {
    // Function error context may already have been consumed.
  }
  return { payload: null, status: null as number | null };
}

function stepFromPayload(
  engine: ScientificRefreshStep['engine'],
  payload: any,
  status: number | null,
  fallbackError: string | null,
): ScientificRefreshStep {
  const blocked = Boolean(payload?.blocked);
  const payloadOk = payload?.ok === true;
  const errorText = String(payload?.error ?? '').trim();
  const rawFallback = String(fallbackError ?? '').trim();
  const temporaryGatewayWait = isTemporaryGatewayDeploymentError(errorText || rawFallback);
  const note = temporaryGatewayWait
    ? 'Sentinel-2 biyofizik servisi hazırlanıyor. Kullanıcıdan işlem gerekmiyor.'
    : (String(payload?.note ?? '').trim() || null);

  return {
    engine,
    ok: payloadOk || blocked || temporaryGatewayWait,
    blocked: blocked || temporaryGatewayWait,
    error: blocked || temporaryGatewayWait ? null : friendlyScientificServiceError(errorText || rawFallback),
    missingInputs: temporaryGatewayWait
      ? ['scientific_service_warming_up']
      : stringArray(payload?.missing_inputs),
    note,
    status,
  };
}

async function invokeStep(
  functionName: string,
  engine: ScientificRefreshStep['engine'],
  fieldId: string,
): Promise<ScientificRefreshStep> {
  try {
    const { data, error } = await withTimeout(
      supabase.functions.invoke(functionName, {
        body: { field_id: fieldId },
      }),
      STEP_TIMEOUT_MS,
      engine.toUpperCase(),
    );

    if (error) {
      const { payload, status } = await payloadFromFunctionError(error);
      if (payload) {
        return stepFromPayload(
          engine,
          payload,
          status,
          error.message || `${engine} yenilenemedi.`,
        );
      }
      const rawMessage = error.message || `${engine} yenilenemedi.`;
      const temporaryGatewayWait = isTemporaryGatewayDeploymentError(rawMessage);
      return {
        engine,
        ok: temporaryGatewayWait,
        blocked: temporaryGatewayWait,
        error: temporaryGatewayWait ? null : friendlyScientificServiceError(rawMessage),
        missingInputs: temporaryGatewayWait ? ['scientific_service_warming_up'] : [],
        note: temporaryGatewayWait ? 'Sentinel-2 biyofizik servisi hazırlanıyor. Kullanıcıdan işlem gerekmiyor.' : null,
        status: null,
      };
    }

    return stepFromPayload(engine, data, 200, null);
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : `${engine} yenilenemedi.`;
    const temporaryGatewayWait = isTemporaryGatewayDeploymentError(rawMessage);
    return {
      engine,
      ok: temporaryGatewayWait,
      blocked: temporaryGatewayWait,
      error: temporaryGatewayWait ? null : friendlyScientificServiceError(rawMessage),
      missingInputs: temporaryGatewayWait ? ['scientific_service_warming_up'] : [],
      note: temporaryGatewayWait ? 'Sentinel-2 biyofizik servisi hazırlanıyor. Kullanıcıdan işlem gerekmiyor.' : null,
      status: null,
    };
  }
}

export async function refreshFieldScientificSignals(fieldId: string): Promise<ScientificRefreshResult> {
  const field = normalizedId(fieldId);
  if (!field) throw new Error('Bilimsel sinyalleri yenilemek için tarla kimliği gerekli.');

  // Order matters: RSCM consumes SL2P LAI, and the UniCrop-inspired confidence
  // layer should see both the new satellite evidence and any completed model run.
  const sl2p = await invokeStep('sl2p-field-biophysics', 'sl2p', field);
  const rscm = await invokeStep('rscm-field-assimilation', 'rscm', field);
  const unicrop = await invokeStep('unicrop-data-confidence', 'unicrop', field);
  const signals = await loadFieldScientificSignals(field);

  return { signals, steps: [sl2p, rscm, unicrop] };
}
