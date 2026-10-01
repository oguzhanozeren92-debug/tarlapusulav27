import { supabase } from '../../../supabaseClient';
import type {
  FieldDataBackboneSnapshot,
  FieldDataDomain,
  FieldDataEvent,
  FieldDataMutation,
  FieldDataSourceClass,
  PublishUserFieldDataEventInput,
} from '../types/fieldDataBackbone';

function cleanText(value: unknown, max = 300) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function cleanTextList(value: unknown, maxItems = 40) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((item) => cleanText(item, 120))
        .filter(Boolean),
    ),
  ).slice(0, maxItems);
}

function cleanPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asMutation(value: unknown): FieldDataMutation {
  const mutation = cleanText(value, 20);
  if (
    mutation === 'saved' ||
    mutation === 'updated' ||
    mutation === 'deleted' ||
    mutation === 'snapshot'
  ) {
    return mutation;
  }
  return 'snapshot';
}

function asSourceClass(value: unknown): FieldDataSourceClass {
  const sourceClass = cleanText(value, 20);
  if (
    sourceClass === 'user' ||
    sourceClass === 'recorded' ||
    sourceClass === 'system' ||
    sourceClass === 'model'
  ) {
    return sourceClass;
  }
  return 'recorded';
}

function mapEvent(row: any): FieldDataEvent {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    fieldId: String(row.field_id),
    domain: cleanText(row.domain, 80) || 'unknown',
    eventType: cleanText(row.event_type, 120) || 'unknown',
    mutation: asMutation(row.mutation),
    source: cleanText(row.source, 160) || 'unknown',
    sourceClass: asSourceClass(row.source_class),
    sourceTable: cleanText(row.source_table, 120) || null,
    sourceRecordId: cleanText(row.source_record_id, 80) || null,
    changedFields: cleanTextList(row.changed_fields),
    payload: cleanPayload(row.payload),
    occurredOn: cleanText(row.occurred_on, 10) || null,
    observedAt: cleanText(row.observed_at, 80) || null,
    createdAt: String(row.created_at),
  };
}

function validIsoDay(value: unknown) {
  const day = cleanText(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function validIsoTimestamp(value: unknown) {
  const raw = cleanText(value, 80);
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

/**
 * Kullanıcının manuel/veri-girişi kaynaklı yeni bir bağlam sinyalini ortak tarla
 * olay defterine ekler. `source_class=user` sunucu tarafındaki RLS ile zorunludur;
 * istemci bu fonksiyonla kendisini uydu/model kaynağı gibi gösteremez.
 */
export async function publishUserFieldDataEvent(
  input: PublishUserFieldDataEventInput,
): Promise<FieldDataEvent> {
  const fieldId = cleanText(input.fieldId, 80);
  const domain = cleanText(input.domain, 80);
  const eventType = cleanText(input.eventType, 120);
  const source = cleanText(input.source, 160);

  if (!fieldId) throw new Error('Veri olayı için tarla seçilemedi.');
  if (!domain) throw new Error('Veri olayı alanı belirtilmedi.');
  if (!eventType) throw new Error('Veri olayı tipi belirtilmedi.');
  if (!source) throw new Error('Veri olayı kaynağı belirtilmedi.');

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    throw new Error('Tarla veri olayını kaydetmek için oturum gerekli.');
  }

  const { data, error } = await supabase
    .from('field_data_events')
    .insert({
      user_id: authData.user.id,
      field_id: fieldId,
      domain,
      event_type: eventType,
      mutation: 'saved',
      source,
      source_class: 'user',
      source_table: null,
      source_record_id: null,
      changed_fields: cleanTextList(input.changedFields),
      payload: cleanPayload(input.payload),
      occurred_on: validIsoDay(input.occurredOn),
      observed_at: validIsoTimestamp(input.observedAt),
    })
    .select('*')
    .single();

  if (error) throw error;
  return mapEvent(data);
}

export async function listRecentFieldDataEvents(
  fieldIdInput: string,
  options: {
    limit?: number;
    domains?: FieldDataDomain[];
  } = {},
): Promise<FieldDataEvent[]> {
  const fieldId = cleanText(fieldIdInput, 80);
  if (!fieldId) return [];

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return [];

  const limit = Math.max(1, Math.min(250, Math.round(options.limit ?? 100)));
  const domains = cleanTextList(options.domains, 20);

  let query = supabase
    .from('field_data_events')
    .select('*')
    .eq('user_id', authData.user.id)
    .eq('field_id', fieldId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (domains.length) {
    query = query.in('domain', domains);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map(mapEvent);
}

/**
 * Pusula/rapor/model katmanlarının aynı "son değişiklikler" bilgisini kullanması
 * için kompakt bir snapshot üretir. Bu fonksiyon tarımsal karar hesaplamaz;
 * yalnız olayları ortak sözleşmeye göre düzenler.
 */
export async function buildFieldDataBackboneSnapshot(
  fieldId: string,
  limit = 120,
): Promise<FieldDataBackboneSnapshot> {
  const events = await listRecentFieldDataEvents(fieldId, { limit });
  const latestByDomain: Record<string, FieldDataEvent> = {};
  const changedFields = new Set<string>();

  for (const event of events) {
    if (!latestByDomain[event.domain]) {
      latestByDomain[event.domain] = event;
    }
    event.changedFields.forEach((field) => changedFields.add(field));
  }

  return {
    fieldId: cleanText(fieldId, 80),
    generatedAt: new Date().toISOString(),
    eventCount: events.length,
    changedFields: [...changedFields],
    latestByDomain,
    events,
  };
}
