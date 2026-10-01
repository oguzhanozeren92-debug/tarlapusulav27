import { supabase } from '../supabaseClient';
import type { PusulaFieldContext } from '../lib/pusulaFieldContext';
import {
  getRothCCarbonContext,
  type RothCCarbonContext,
} from './rothcCarbonContextService';
import {
  loadFieldScientificSignals,
  type FieldScientificSignals,
} from './fieldScientificSignals.service';

export type PersistedPusulaFieldContext = PusulaFieldContext & {
  soilCarbon?: RothCCarbonContext | null;
  scientificSignals?: FieldScientificSignals | null;
};

function appendUnique(values: string[], value: string) {
  return values.includes(value) ? values : [...values, value];
}

function withRothCSourceHealth(
  context: PusulaFieldContext,
  soilCarbon: RothCCarbonContext | null,
) {
  const sourceHealth = {
    ready: [...(context.sourceHealth?.ready ?? [])],
    partial: [...(context.sourceHealth?.partial ?? [])],
    unavailable: [...(context.sourceHealth?.unavailable ?? [])],
  };

  sourceHealth.ready = sourceHealth.ready.filter((item) => item !== 'rothc');
  sourceHealth.partial = sourceHealth.partial.filter((item) => item !== 'rothc');
  sourceHealth.unavailable = sourceHealth.unavailable.filter((item) => item !== 'rothc');

  if (soilCarbon?.status === 'ready') {
    sourceHealth.ready = appendUnique(sourceHealth.ready, 'rothc');
  } else if (soilCarbon?.status === 'partial') {
    sourceHealth.partial = appendUnique(sourceHealth.partial, 'rothc');
  } else {
    sourceHealth.unavailable = appendUnique(sourceHealth.unavailable, 'rothc');
  }

  return sourceHealth;
}

function withScientificSourceHealth(
  sourceHealth: PusulaFieldContext['sourceHealth'],
  signals: FieldScientificSignals | null,
) {
  const next = {
    ready: [...sourceHealth.ready],
    partial: [...sourceHealth.partial],
    unavailable: [...sourceHealth.unavailable],
  };

  for (const key of ['sl2p', 'rscm', 'unicrop']) {
    next.ready = next.ready.filter((item) => item !== key);
    next.partial = next.partial.filter((item) => item !== key);
    next.unavailable = next.unavailable.filter((item) => item !== key);
  }

  if (signals?.biophysics.latest) next.ready = appendUnique(next.ready, 'sl2p');
  else next.unavailable = appendUnique(next.unavailable, 'sl2p');

  if (signals?.rscm) next.ready = appendUnique(next.ready, 'rscm');
  else if ((signals?.biophysics.historyCount ?? 0) > 0) next.partial = appendUnique(next.partial, 'rscm');
  else next.unavailable = appendUnique(next.unavailable, 'rscm');

  if (signals?.dataConfidence) next.ready = appendUnique(next.ready, 'unicrop');
  else next.unavailable = appendUnique(next.unavailable, 'unicrop');

  return next;
}

async function buildRothCContext(
  context: PusulaFieldContext,
): Promise<RothCCarbonContext | null> {
  const rawLatitude = context.field?.latitude;
  const rawLongitude = context.field?.longitude;
  const fieldId = String(context.field?.id ?? '').trim();

  if (
    !fieldId ||
    rawLatitude === null ||
    rawLatitude === undefined ||
    rawLongitude === null ||
    rawLongitude === undefined
  ) {
    return null;
  }

  const latitude = Number(rawLatitude);
  const longitude = Number(rawLongitude);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }

  try {
    return await getRothCCarbonContext({
      fieldId,
      latitude,
      longitude,
    });
  } catch (error) {
    console.info(
      'RothC Pusula bağlamı hazırlanamadı:',
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

export async function savePusulaFieldContextSnapshot(
  context: PusulaFieldContext,
) {
  if (!supabase) return { saved: false as const, reason: 'no_supabase' };

  const {
    data: sessionData,
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !sessionData.session?.user?.id) {
    return { saved: false as const, reason: 'no_session' };
  }

  const userId = sessionData.session.user.id;

  /*
   * RothC görünür bir kart değildir. Pusula tarla bağlamı hazırlanırken
   * SoilGrids kil/SOC + son 12 tam aylık iklimden bağımsız karbon çevrim
   * kanıtı üretir ve aynı JSON snapshot içinde saklanır.
   *
   * Tam t C/ha simülasyonu yapılmaz; yönetim girdileri eksikse RothC servisi
   * bunu açıkça blocked/turnover-context olarak taşır.
   */
  const [soilCarbon, scientificSignals] = await Promise.all([
    buildRothCContext(context),
    loadFieldScientificSignals(String(context.field.id)).catch((error) => {
      console.info(
        'SL2P/RSCM/Veri Güveni Pusula bağlamı hazırlanamadı:',
        error instanceof Error ? error.message : error,
      );
      return null;
    }),
  ]);
  const rothCSourceHealth = withRothCSourceHealth(context, soilCarbon);
  const sourceHealth = withScientificSourceHealth(rothCSourceHealth, scientificSignals);

  const persistedContext: PersistedPusulaFieldContext = {
    ...context,
    sourceHealth,
    soilCarbon,
    scientificSignals,
  };

  const { error } = await supabase
    .from('pusula_field_context_snapshots')
    .upsert(
      {
        user_id: userId,
        field_id: context.field.id,
        schema_version: context.schemaVersion,
        context: persistedContext,
        source_health: sourceHealth,
        generated_at: context.generatedAt,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_id,field_id',
      },
    );

  if (error) {
    console.info(
      'Pusula field context snapshot kaydedilemedi:',
      error.message,
    );

    return {
      saved: false as const,
      reason: error.message,
    };
  }

  return {
    saved: true as const,
    soilCarbonStatus: soilCarbon?.status ?? 'unavailable',
  };
}

export async function loadLatestPusulaFieldContext(
  fieldId: string,
): Promise<PersistedPusulaFieldContext | null> {
  if (!supabase || !fieldId) return null;

  const { data, error } = await supabase
    .from('pusula_field_context_snapshots')
    .select('context')
    .eq('field_id', String(fieldId))
    .maybeSingle();

  if (error || !data?.context) return null;

  return data.context as PersistedPusulaFieldContext;
}
