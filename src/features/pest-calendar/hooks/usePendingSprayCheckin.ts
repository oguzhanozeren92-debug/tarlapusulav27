import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../supabaseClient';
import { followUpAt, type SprayResponse } from '../services/pestReminder';

export type PendingSprayCheckin = {
  id: string; fieldId: string; fieldName: string; crop: string; pests: string[]; month: string;
};

/** Sorma zamanı gelmiş, cevaplanmamış (veya "yapacağım" denmiş) ilaçlama yoklaması. */
export function usePendingSprayCheckin() {
  const [pending, setPending] = useState<PendingSprayCheckin | null>(null);

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setPending(null); return; }
    const { data, error } = await supabase.from('pest_spray_checkins')
      .select('id,field_id,crop,pests,month,response,ask_at')
      .eq('user_id', auth.user.id)
      .lte('ask_at', new Date().toISOString())
      .or('response.is.null,response.eq.yapacagim')
      .order('ask_at', { ascending: true })
      .limit(1);
    if (error || !data?.length) { setPending(null); return; }
    const row: any = data[0];
    const field = await supabase.from('fields').select('name').eq('id', row.field_id).maybeSingle();
    setPending({
      id: String(row.id), fieldId: String(row.field_id), fieldName: String(field.data?.name || 'Tarlan'),
      crop: String(row.crop ?? ''), pests: Array.isArray(row.pests) ? row.pests : [], month: String(row.month),
    });
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener('tp:notifications-updated', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('tp:notifications-updated', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [load]);

  const answer = useCallback(async (id: string, response: SprayResponse) => {
    const now = new Date();
    const next = followUpAt(response, now);
    const patch: Record<string, unknown> = { response, responded_at: now.toISOString() };
    if (next) patch.ask_at = next.toISOString();
    const { error } = await supabase.from('pest_spray_checkins').update(patch).eq('id', id);
    if (error) throw new Error('Cevap kaydedilemedi, internet bağlantını kontrol edip tekrar dene.');
    setPending(null);
  }, []);

  return { pending, answer, reload: load };
}
