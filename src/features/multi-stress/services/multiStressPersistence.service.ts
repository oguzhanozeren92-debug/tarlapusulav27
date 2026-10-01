import { supabase } from '../../../supabaseClient';
import type { MultiStressSynthesis } from '../types/multiStress';

const NAMESPACE = 'multi-stress-v1';
const RETENTION_MS = 20 * 365 * 24 * 60 * 60 * 1000;

export async function persistMultiStressSynthesis(
  synthesis: MultiStressSynthesis | null | undefined,
) {
  if (!synthesis?.fieldId) return false;

  const { data, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const userId = data.session?.user?.id;
  if (!userId) return false;

  const now = new Date();
  const { error } = await supabase.from('field_map_layer_cache').upsert({
    user_id: userId,
    field_id: synthesis.fieldId,
    namespace: NAMESPACE,
    cache_key: `${synthesis.fieldId}:latest`,
    payload: {
      layer: 'multi-stress-synthesis',
      sourceModel: 'multi-stress-synthesis-v26',
      observedAt: synthesis.observedAt,
      synthesis,
      archivedAt: now.toISOString(),
    },
    data_date: (synthesis.observedAt ?? synthesis.generatedAt).slice(0, 10),
    source_key: 'multi-stress-synthesis-v26',
    saved_at: now.toISOString(),
    expires_at: new Date(now.getTime() + RETENTION_MS).toISOString(),
    updated_at: now.toISOString(),
  }, { onConflict: 'user_id,field_id,namespace,cache_key' });

  if (error) throw error;
  return true;
}
