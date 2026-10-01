import { supabase } from '../../../supabaseClient';
import { buildFieldDataBackboneSnapshot } from '../../data-backbone/services/fieldDataBackbone.service';
import type { FieldDataEvent } from '../../data-backbone/types/fieldDataBackbone';

const NAMESPACE = 'pdf-layer-archive-v1';
const LAYER = 'field-data-backbone';
const PROCESSING_VERSION = 'field-data-backbone-v1';
const RETENTION_MS = 20 * 365 * 24 * 60 * 60 * 1000;

function text(value: unknown, max = 300) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function dateOnly(value: unknown) {
  const raw = text(value, 80);
  if (!raw) return null;
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null;
}

function compactPayload(value: Record<string, unknown>) {
  const blocked = new Set([
    'aiResult',
    'ai_result',
    'reportPath',
    'report_path',
    'pdfPath',
    'pdf_path',
    'parcelGeometry',
    'parcel_geometry',
  ]);
  return Object.fromEntries(
    Object.entries(value ?? {})
      .filter(([key]) => !blocked.has(key))
      .slice(0, 30)
      .map(([key, item]) => {
        if (typeof item === 'string') return [key, text(item, 500)];
        if (typeof item === 'number' || typeof item === 'boolean' || item == null) {
          return [key, item];
        }
        if (Array.isArray(item)) return [key, item.slice(0, 12)];
        if (typeof item === 'object') {
          const serialized = JSON.stringify(item);
          return [key, serialized.length <= 2500 ? item : text(serialized, 2500)];
        }
        return [key, null];
      }),
  );
}

function compactEvent(event: FieldDataEvent) {
  return {
    id: event.id,
    domain: event.domain,
    eventType: event.eventType,
    mutation: event.mutation,
    source: event.source,
    sourceClass: event.sourceClass,
    sourceTable: event.sourceTable,
    sourceRecordId: event.sourceRecordId,
    changedFields: event.changedFields.slice(0, 20),
    payload: compactPayload(event.payload),
    occurredOn: event.occurredOn,
    observedAt: event.observedAt,
    createdAt: event.createdAt,
  };
}

function activeLatestEvents(events: FieldDataEvent[]) {
  const latestByRecord = new Map<string, FieldDataEvent>();
  const independent: FieldDataEvent[] = [];

  for (const event of events) {
    const key = event.sourceRecordId
      ? `${event.sourceTable ?? event.domain}:${event.sourceRecordId}`
      : '';
    if (!key) {
      if (event.mutation !== 'deleted') independent.push(event);
      continue;
    }
    if (!latestByRecord.has(key)) latestByRecord.set(key, event);
  }

  return [...latestByRecord.values(), ...independent].filter(
    (event) => event.mutation !== 'deleted',
  );
}

export async function mirrorFieldDataBackboneForPdf(fieldIdInput: string) {
  const fieldId = text(fieldIdInput, 80);
  if (!fieldId) return false;

  const [{ data: sessionData }, snapshot] = await Promise.all([
    supabase.auth.getSession(),
    buildFieldDataBackboneSnapshot(fieldId, 160),
  ]);
  const userId = sessionData.session?.user?.id;
  if (!userId) return false;

  const activeEvents = activeLatestEvents(snapshot.events);
  const domains = Array.from(new Set(activeEvents.map((event) => event.domain))).sort();
  const operationCount = activeEvents.filter((event) => event.domain === 'operation').length;
  const soilAnalysisCount = activeEvents.filter(
    (event) => event.eventType === 'soil_analysis',
  ).length;
  const waterMeasurementCount = activeEvents.filter(
    (event) => event.eventType === 'soil_water_measurement',
  ).length;
  const growthObservationCount = activeEvents.filter(
    (event) => event.eventType === 'growth_observation',
  ).length;

  const latestByDomain = Object.fromEntries(
    Object.entries(snapshot.latestByDomain).map(([domain, event]) => [
      domain,
      compactEvent(event),
    ]),
  );
  const now = new Date();
  const observedAt = snapshot.events[0]?.observedAt ?? snapshot.events[0]?.createdAt ?? snapshot.generatedAt;
  const observedDate = dateOnly(observedAt) ?? now.toISOString().slice(0, 10);
  const sourceKey = `${LAYER}:${observedDate}:timeline:${PROCESSING_VERSION}`;
  const cacheKey = `${fieldId}:${sourceKey}`;
  const payload = {
    schemaVersion: 1,
    fieldId,
    layer: LAYER,
    source: 'TarlaPusula ortak tarla veri omurgası',
    observedAt,
    processingVersion: PROCESSING_VERSION,
    metrics: {
      eventCount: snapshot.eventCount,
      activeEventCount: activeEvents.length,
      domainCount: domains.length,
      operationCount,
      soilAnalysisCount,
      waterMeasurementCount,
      growthObservationCount,
    },
    details: {
      generatedAt: snapshot.generatedAt,
      changedFields: snapshot.changedFields.slice(0, 80),
      domains,
      latestByDomain,
      events: activeEvents.slice(0, 50).map(compactEvent),
    },
    archivedAt: now.toISOString(),
  };

  const { error } = await supabase.from('field_map_layer_cache').upsert(
    {
      user_id: userId,
      field_id: fieldId,
      namespace: NAMESPACE,
      cache_key: cacheKey,
      payload,
      data_date: observedDate,
      source_key: sourceKey,
      saved_at: now.toISOString(),
      expires_at: new Date(now.getTime() + RETENTION_MS).toISOString(),
      updated_at: now.toISOString(),
    },
    { onConflict: 'user_id,field_id,namespace,cache_key' },
  );

  if (error) {
    console.warn('[PUSULAPDF] tarla veri omurgası aynalanamadı:', error.message);
    return false;
  }

  return true;
}
