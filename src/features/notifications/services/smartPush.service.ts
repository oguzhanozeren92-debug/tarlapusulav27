import { supabase } from '../../../supabaseClient';
import type { HybrisFieldEvent } from '../../../services/hybrisFieldEvents.service';
import { fieldEventCandidateKey } from '../../field-events/services/fieldEventCandidateFeedback.service';

export type SmartPushCategory =
  | 'critical'
  | 'weather'
  | 'satellite'
  | 'field_activity'
  | 'irrigation'
  | 'plant_health'
  | 'market'
  | 'support'
  | 'news'
  | 'reports'
  | 'achievement'
  | 'reengagement'
  | 'system';

function eventLabel(event: HybrisFieldEvent) {
  if (event.type === 'sowing') return 'ekim / dikim';
  if (event.type === 'harvest') return 'hasat';
  return 'toprak işleme';
}

function fieldActivityMessage(fieldName: string, event: HybrisFieldEvent) {
  const label = eventLabel(event);
  return `${fieldName} tarlasında ${label} ile uyumlu yeni bir değişim olasılığı fark ettim. Ne yaptığını doğrularsan tarla kayıtlarını güncelleyebilirim.`;
}

export async function queueFirstFieldActivityPush(input: {
  fieldId: string;
  event: HybrisFieldEvent;
}) {
  const fieldId = String(input.fieldId ?? '').trim();
  if (!fieldId || input.event.confidence !== 'medium') return null;

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return null;

  let fieldName = 'Tarlan';
  try {
    const { data } = await supabase
      .from('fields')
      .select('name')
      .eq('id', fieldId)
      .eq('user_id', auth.user.id)
      .maybeSingle();
    fieldName = String(data?.name ?? '').trim() || fieldName;
  } catch {
    // Tarla adı alınamazsa güvenli genel başlık kullanılır.
  }

  const candidateKey = fieldEventCandidateKey(input.event);
  const dedupeKey = `field-activity:${auth.user.id}:${fieldId}:${candidateKey}`;

  try {
    const { data, error } = await supabase.functions.invoke('send-due-reminders', {
      body: {
        enqueuePush: {
          category: 'field_activity',
          kind: 'field_activity',
          source: 'hybris',
          severity: 'info',
          title: 'Pusula yeni bir faaliyet fark etti',
          message: fieldActivityMessage(fieldName, input.event),
          target: 'home',
          dedupeKey,
          critical: false,
          data: {
            fieldId,
            fieldName,
            candidateKey,
            eventType: input.event.type,
            signalDate: input.event.signalDate,
            uncertaintyDays: input.event.uncertaintyDays,
            confidence: input.event.confidence,
            prominence: input.event.prominence,
            actionTarget: 'field-activity',
          },
        },
      },
    });

    if (error) throw error;
    return data ?? null;
  } catch (error) {
    console.warn('[smart-push] İlk faaliyet bildirimi kuyruğa alınamadı:', error);
    return null;
  }
}
