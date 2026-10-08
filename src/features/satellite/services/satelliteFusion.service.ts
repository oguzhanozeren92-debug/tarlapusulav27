import { supabase } from '../../../supabaseClient';
import type {
  SatelliteFusionErrorResponse,
  SatelliteFusionResponse,
} from '../types/satelliteFusion';

const CACHE_TTL_MS = 30 * 60 * 1000;

const memoryCache = new Map<
  string,
  {
    expiresAt: number;
    value: SatelliteFusionResponse;
  }
>();

const inflight = new Map<string, Promise<SatelliteFusionResponse>>();

function normalizeFieldId(value: string | number | null | undefined) {
  return String(value ?? '').trim();
}

function normalizeResponse(
  value: SatelliteFusionResponse | Record<string, any>,
): SatelliteFusionResponse {
  const raw = value as Record<string, any>;

  return {
    ...(raw as SatelliteFusionResponse),
    activeProduction:
      raw.activeProduction ??
      raw.active_production ??
      null,
    generatedAt:
      String(raw.generatedAt ?? raw.generated_at ?? '').trim() ||
      new Date().toISOString(),
  };
}

async function readFunctionErrorMessage(error: any) {
  const fallback = String(error?.message ?? '').trim();
  const context = error?.context;

  try {
    if (context && typeof context.clone === 'function') {
      const cloned = context.clone();
      const body = await cloned.json();
      const message = String(
        body?.message ?? body?.error ?? body?.details ?? '',
      ).trim();
      if (message) return message;
    }
  } catch {
    // HTTP hata gövdesi JSON değilse SDK mesajına düş.
  }

  return fallback || 'Sentinel fusion isteği başarısız.';
}

export async function fetchFieldSatelliteFusion(
  fieldIdInput: string | number,
  force = false,
): Promise<SatelliteFusionResponse> {
  const fieldId = normalizeFieldId(fieldIdInput);

  if (!fieldId) {
    throw new Error(
      'Sentinel fusion için tarla kimliği bulunamadı.',
    );
  }

  const cached = memoryCache.get(fieldId);

  if (
    !force &&
    cached &&
    cached.expiresAt > Date.now()
  ) {
    return cached.value;
  }

  const running = inflight.get(fieldId);
  if (!force && running) return running;

  const request = (async () => {
    /*
      field-satellite-fusion sunucuda strict bir sözleşme kullanır:
      request body içinde SADECE `field_id` kabul edilir.
      `force`, `geometry`, gün/eşik gibi ilave anahtarlar gönderilirse
      Edge Function `server_derived_only` ile HTTP 400 döndürür.
      `force` burada yalnız istemci cache'ini atlamak için kullanılır;
      sunucuya gönderilmez.
    */
    const { data, error } = await supabase.functions.invoke<
      SatelliteFusionResponse | SatelliteFusionErrorResponse
    >('field-satellite-fusion', {
      body: {
        field_id: fieldId,
      },
    });

    if (error) {
      const message = await readFunctionErrorMessage(error);
      throw new Error(`Sentinel fusion isteği başarısız: ${message}`);
    }

    if (!data || data.success !== true) {
      const failed = data as SatelliteFusionErrorResponse | null;

      throw new Error(
        failed?.message ??
          failed?.error ??
          'Sentinel-1 + Sentinel-2 fusion verisi alınamadı.',
      );
    }

    const normalized = normalizeResponse(data as SatelliteFusionResponse);

    memoryCache.set(fieldId, {
      value: normalized,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return normalized;
  })();

  inflight.set(fieldId, request);

  try {
    return await request;
  } finally {
    if (inflight.get(fieldId) === request) {
      inflight.delete(fieldId);
    }
  }
}

export function clearFieldSatelliteFusionCache(
  fieldIdInput?: string | number | null,
) {
  const fieldId = normalizeFieldId(fieldIdInput);

  if (fieldId) {
    memoryCache.delete(fieldId);
    inflight.delete(fieldId);
    return;
  }

  memoryCache.clear();
  inflight.clear();
}
