import { supabase } from '../../../supabaseClient';
import type { HomeDecisionEvent } from '../../decision/types/homeDecision';
import { buildMultiStressSynthesis } from '../../multi-stress/services/multiStressSynthesis.service';
import type { MultiStressSynthesis } from '../../multi-stress/types/multiStress';

const PDF_NAMESPACE = 'pdf-layer-archive-v1';
const LIVE_NAMESPACE = 'multi-stress-v1';
const RETENTION_MS = 20 * 365 * 24 * 60 * 60 * 1000;

function objectValue(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function listText(value: unknown, limit = 8) {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? '').trim()).filter(Boolean).slice(0, limit)
    : [];
}

function confidence(value: unknown): HomeDecisionEvent['confidence'] {
  const raw = String(value ?? '').toLowerCase();
  if (raw === 'strong' || raw === 'high') return 'strong';
  if (raw === 'medium') return 'medium';
  return 'preliminary';
}

function baseEvent(input: {
  id: string;
  group: string;
  source: HomeDecisionEvent['source'];
  sourceModel: string;
  observedAt?: string | null;
  severity?: HomeDecisionEvent['severity'];
  title: string;
  detail: string;
  evidence?: string[];
  confidence?: HomeDecisionEvent['confidence'];
}): HomeDecisionEvent {
  return {
    id: input.id,
    group: input.group,
    source: input.source,
    sourceModel: input.sourceModel,
    signal: { status: 'ready', observedAt: input.observedAt ?? null, maxAgeHours: 30 * 24 },
    priority: input.severity === 'danger' ? 100 : 85,
    severity: input.severity ?? 'warning',
    target: 'ai',
    channels: ['pusula'],
    kind: 'check',
    label: input.title,
    title: input.title,
    detail: input.detail,
    evidence: input.evidence ?? [],
    confidence: input.confidence ?? 'preliminary',
  };
}

function eventsFromPdfArchive(rows: any[]): HomeDecisionEvent[] {
  const latestByLayer = new Map<string, any>();
  for (const row of rows) {
    const payload = objectValue(row?.payload);
    const layer = String(payload.layer ?? '').trim();
    if (!layer || latestByLayer.has(layer)) continue;
    latestByLayer.set(layer, payload);
  }

  const events: HomeDecisionEvent[] = [];

  const scarcity = latestByLayer.get('water-scarcity-plan');
  if (scarcity) {
    const metrics = objectValue(scarcity.metrics);
    const details = objectValue(scarcity.details);
    const state = String(metrics.state ?? '');
    if (['controlled_reduce', 'protect_water', 'scarcity_plan'].includes(state)) {
      events.push(baseEvent({
        id: `pdf-water-scarcity:${state}`,
        group: 'water-scarcity',
        source: 'water-scarcity',
        sourceModel: 'water-scarcity-plan-engine-v23',
        observedAt: scarcity.observedAt ?? null,
        severity: state === 'scarcity_plan' ? 'danger' : 'warning',
        title: String(details.headline ?? 'Su açığı / kıtlık planı'),
        detail: String(details.summary ?? details.action ?? 'Su bütçesi baskısı mevcut.'),
        evidence: listText(details.evidence),
        confidence: confidence(metrics.confidence),
      }));
    }
  }

  const irrigation = latestByLayer.get('irrigation-synthesis');
  if (irrigation) {
    const metrics = objectValue(irrigation.metrics);
    const details = objectValue(irrigation.details);
    const decision = String(metrics.decision ?? '');
    const deficit = finite(metrics.currentDeficitMm);
    const threshold = finite(metrics.stressThresholdMm);
    if (decision === 'irrigate_now' || (deficit !== null && threshold !== null && deficit >= threshold)) {
      events.push(baseEvent({
        id: `pdf-irrigation:${decision || 'water-deficit'}`,
        group: 'irrigation',
        source: 'irrigation',
        sourceModel: 'irrigation-engine',
        observedAt: irrigation.observedAt ?? null,
        severity: decision === 'irrigate_now' ? 'warning' : 'warning',
        title: decision === 'irrigate_now' ? 'Sulama ihtiyacı aktif' : 'Kök bölgesi su açığı stresi yaklaşıyor',
        detail: String(details.summary ?? 'Production sulama motorunda aktif su açığı sinyali var.'),
        evidence: listText(details.evidence),
        confidence: confidence(metrics.decisionConfidence),
      }));
    }
  }

  const distribution = latestByLayer.get('irrigation-distribution');
  if (distribution) {
    const metrics = objectValue(distribution.metrics);
    const details = objectValue(distribution.details);
    const status = String(metrics.status ?? '');
    if (status === 'suspect' || status === 'recurrent') {
      events.push(baseEvent({
        id: `pdf-irrigation-distribution:${status}`,
        group: 'irrigation-distribution',
        source: 'irrigation-distribution',
        sourceModel: 'irrigation-distribution-engine-v22',
        observedAt: distribution.observedAt ?? null,
        severity: 'warning',
        title: status === 'recurrent' ? 'Tekrarlayan sulama dağılım şüphesi' : 'Sulama dağılım şüphesi',
        detail: `${String(details.area ?? 'Tarla geneli')} bölümünde sulama sonrası farklı tepki izlendi.`,
        evidence: listText(details.evidence),
        confidence: confidence(metrics.confidence),
      }));
    }
  }

  const weather = latestByLayer.get('weather-history');
  if (weather) {
    const metrics = objectValue(weather.metrics);
    const tMax = finite(metrics.tempMax ?? metrics.temperatureMax ?? metrics.maxTemperatureC);
    const tMin = finite(metrics.tempMin ?? metrics.temperatureMin ?? metrics.minTemperatureC);
    if ((tMax !== null && tMax >= 38) || (tMin !== null && tMin <= 1)) {
      const cold = tMin !== null && tMin <= 1;
      events.push(baseEvent({
        id: `pdf-weather:${cold ? 'frost' : 'heat'}`,
        group: 'temperature-risk',
        source: 'weather',
        sourceModel: 'weather-decision',
        observedAt: weather.observedAt ?? null,
        severity: cold && tMin !== null && tMin <= 0 ? 'danger' : 'warning',
        title: cold ? 'Düşük sıcaklık riski' : 'Yüksek sıcaklık / ısı stresi riski',
        detail: cold ? `Minimum sıcaklık ${tMin?.toFixed(1)} °C.` : `Maksimum sıcaklık ${tMax?.toFixed(1)} °C.`,
        evidence: [],
        confidence: 'medium',
      }));
    }
  }

  const micro = latestByLayer.get('microclimate-sensor');
  if (micro) {
    const metrics = objectValue(micro.metrics);
    const air = finite(metrics.airTemperatureC);
    const hydraulic = Boolean(metrics.pressureAlert || metrics.flowAlert);
    if (hydraulic || (air !== null && (air <= 1 || air >= 38))) {
      events.push(baseEvent({
        id: `pdf-microclimate:${hydraulic ? 'hydraulic' : 'temperature'}`,
        group: 'microclimate-sensor',
        source: 'microclimate-sensor',
        sourceModel: 'microclimate-sensor-v24',
        observedAt: micro.observedAt ?? null,
        severity: air !== null && air <= 0 ? 'danger' : 'warning',
        title: hydraulic
          ? 'Debi / basınç sensörü beklenen aralığın dışında'
          : air !== null && air <= 1
            ? 'Saha sensöründe çok düşük sıcaklık'
            : 'Saha sensöründe yüksek sıcaklık',
        detail: hydraulic
          ? 'Gerçek saha sensöründe debi veya basınç beklenen aralığın dışında.'
          : `Gerçek saha sıcaklığı ${air?.toFixed(1)} °C ölçüldü.`,
        evidence: [],
        confidence: finite(metrics.ageMinutes) !== null && Number(metrics.ageMinutes) <= 60 ? 'strong' : 'medium',
      }));
    }
  }

  const plantHealth = latestByLayer.get('plant-health-synthesis');
  if (plantHealth) {
    const metrics = objectValue(plantHealth.metrics);
    const details = objectValue(plantHealth.details);
    const riskScore = finite(metrics.riskScore);
    const riskLevel = String(metrics.riskLevel ?? '').toLowerCase();
    const active = ['moderate', 'high', 'critical', 'warning', 'danger'].includes(riskLevel) || (riskScore !== null && riskScore >= 35);
    if (active) {
      events.push(baseEvent({
        id: 'pdf-plant-health-risk',
        group: 'plant-health-risk',
        source: 'risk-radar',
        sourceModel: String(details.sourceModel ?? 'risk-radar'),
        observedAt: plantHealth.observedAt ?? null,
        severity: ['high', 'critical', 'danger'].includes(riskLevel) || (riskScore !== null && riskScore >= 70) ? 'danger' : 'warning',
        title: String(details.title ?? details.threatName ?? 'Hastalık / zararlı riski'),
        detail: String(details.detail ?? 'Risk Radar aktif risk sinyali üretti.'),
        evidence: listText(details.evidence),
        confidence: confidence(details.confidence),
      }));
    }
  }

  const disaster = latestByLayer.get('disaster-recovery');
  if (disaster) {
    const metrics = objectValue(disaster.metrics);
    const details = objectValue(disaster.details);
    const status = String(metrics.status ?? '');
    const eventType = String(metrics.eventType ?? details.event?.type ?? '').toLowerCase();
    if (['damage_signal_supported', 'recovering'].includes(status) && eventType) {
      const isFrost = eventType === 'frost';
      const isHeat = eventType === 'extreme_heat';
      const isRain = eventType === 'heavy_rain';
      if (isFrost || isHeat || isRain) {
        events.push(baseEvent({
          id: `pdf-disaster-recovery:${eventType}:${String(metrics.eventDate ?? details.event?.date ?? 'event')}`,
          group: 'disaster-recovery',
          source: 'disaster-recovery',
          sourceModel: 'disaster-recovery-v27',
          observedAt: disaster.observedAt ?? metrics.eventDate ?? null,
          severity: status === 'damage_signal_supported' ? 'warning' : 'warning',
          title: String(details.headline ?? (isFrost ? 'Don sonrası değişim sinyali' : isHeat ? 'Aşırı sıcak sonrası değişim sinyali' : 'Ağır yağış sonrası değişim sinyali')),
          detail: String(details.summary ?? 'Hava olayı ile olay sonrası uydu değişimi birlikte izlendi.'),
          evidence: listText(details.evidence),
          confidence: confidence(metrics.confidence),
        }));
      }
    }
  }

  const frost = latestByLayer.get('frost-pocket');
  if (frost) {
    const metrics = objectValue(frost.metrics);
    const details = objectValue(frost.details);
    const latestEvent = objectValue(details.latestEvent);
    const postStatus = String(metrics.postEventSatelliteStatus ?? '');
    const forecastSignal = String(metrics.forecastFrostSignal ?? details.forecast?.frostSignal ?? 'none');
    const forecastMin = finite(metrics.forecastMinTemperatureC ?? details.forecast?.minTemperatureC);
    if (latestEvent.eventDate || postStatus === 'negative_change_after_event' || forecastSignal === 'frost' || forecastSignal === 'watch') {
      events.push(baseEvent({
        id: 'pdf-frost-pocket',
        group: 'frost-pocket',
        source: 'frost-pocket',
        sourceModel: 'frost-pocket-engine-v20',
        observedAt: latestEvent.eventDate ?? frost.observedAt ?? null,
        severity: (finite(latestEvent.observedMinTempC) !== null && Number(latestEvent.observedMinTempC) <= -1) || forecastSignal === 'frost' ? 'danger' : 'warning',
        title: 'Don / düşük sıcaklık saha sinyali',
        detail: postStatus === 'negative_change_after_event'
          ? 'Kayıtlı don olayından sonra negatif uydu değişimi saha doğrulaması istiyor.'
          : forecastSignal === 'frost'
            ? `Don tahmini aktif${forecastMin !== null ? `; minimum ${forecastMin.toFixed(1)} °C` : ''}.`
            : forecastSignal === 'watch'
              ? `Don takibi gerekli${forecastMin !== null ? `; minimum ${forecastMin.toFixed(1)} °C` : ''}.`
              : 'Kayıtlı don olayı çoklu stres bağlamına eklendi.',
        evidence: listText(details.evidence),
        confidence: 'medium',
      }));
    }
  }

  const nutrient = latestByLayer.get('nutrition-decision-guard');
  if (nutrient) {
    const metrics = objectValue(nutrient.metrics);
    const details = objectValue(nutrient.details);
    if (metrics.productionAuthorityPresent === true && details.eventId) {
      events.push(baseEvent({
        id: `pdf-nutrition:${String(details.eventId)}`,
        group: 'nutrition',
        source: 'nutrition',
        sourceModel: String(details.sourceModel ?? 'soil-nutrition-engine'),
        observedAt: nutrient.observedAt ?? null,
        severity: 'warning',
        title: String(details.title ?? 'Besin / toprak kararı'),
        detail: String(details.detail ?? 'Üretim otoriteli besin/toprak kararı mevcut.'),
        evidence: listText(details.evidence),
        confidence: confidence(details.confidence),
      }));
    }
  }

  return events;
}

async function loadPersistedSynthesis(fieldId: string, userId: string): Promise<MultiStressSynthesis | null> {
  const { data, error } = await supabase
    .from('field_map_layer_cache')
    .select('payload,updated_at')
    .eq('user_id', userId)
    .eq('field_id', fieldId)
    .eq('namespace', LIVE_NAMESPACE)
    .eq('cache_key', `${fieldId}:latest`)
    .maybeSingle();

  if (error) return null;
  const payload = objectValue(data?.payload);
  const synthesis = objectValue(payload.synthesis) as unknown as MultiStressSynthesis;
  return synthesis?.version === '26.0' ? synthesis : null;
}

async function rebuildFromPdfArchive(fieldId: string, userId: string) {
  const { data, error } = await supabase
    .from('field_map_layer_cache')
    .select('payload,updated_at')
    .eq('user_id', userId)
    .eq('field_id', fieldId)
    .eq('namespace', PDF_NAMESPACE)
    .order('updated_at', { ascending: false })
    .limit(100);

  if (error) throw error;
  const events = eventsFromPdfArchive(data ?? []);
  return buildMultiStressSynthesis(fieldId, events, new Date());
}

export async function mirrorLatestMultiStressEvidenceForPdf(fieldIdInput: string) {
  const fieldId = String(fieldIdInput ?? '').trim();
  if (!fieldId) return false;

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const userId = sessionData.session?.user?.id;
  if (!userId) return false;

  let synthesis = await loadPersistedSynthesis(fieldId, userId);
  if (!synthesis || Date.now() - Date.parse(synthesis.generatedAt) > 48 * 60 * 60 * 1000) {
    synthesis = await rebuildFromPdfArchive(fieldId, userId);
  }

  const now = new Date();
  const { error } = await supabase.from('field_map_layer_cache').upsert({
    user_id: userId,
    field_id: fieldId,
    namespace: PDF_NAMESPACE,
    cache_key: `${fieldId}:multi-stress-synthesis`,
    payload: {
      layer: 'multi-stress-synthesis',
      label: 'Birleşik Çoklu Stres Zekâsı',
      sourceModel: 'multi-stress-synthesis-v26',
      productionAuthority: false,
      observedAt: synthesis.observedAt ?? synthesis.generatedAt,
      metrics: {
        status: synthesis.status,
        confidence: synthesis.confidence,
        dominantFamily: synthesis.dominantFamily,
        stressFamilyCount: synthesis.signals.length,
        supportingSatelliteEvidenceCount: synthesis.supportingSatelliteEvidence.length,
      },
      details: synthesis,
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
