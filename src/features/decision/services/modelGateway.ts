import type {
  HomeDecisionConfidence,
  HomeDecisionEvent,
  HomeDecisionSource,
} from '../types/homeDecision';
import type {
  HarmonizedHomeDecisionEvent,
  ModelGatewayEnvelope,
  ModelSignalStatus,
  ModelSignalFreshness,
  ModelSignalQualityFlag,
} from '../types/modelGateway';
import { resolveScientificAuthority } from '../../scientific-engine/services/scientificAuthority.service';

const SOURCE_MODELS: Record<HomeDecisionSource, string> = {
  field: 'field-context',
  weather: 'weather-decision',
  calendar: 'calendar',
  satellite: 'satellite-decision',
  pusula: 'field-synthesis',
  'risk-radar': 'risk-radar',
  irrigation: 'irrigation-decision',
  phenology: 'phenology',
  operation: 'field-operations',
  nutrition: 'soil-nutrition',
  'weed-intelligence': 'weed-intelligence',
  'yield-harvest': 'yield-harvest-engine',
  'orchard-tree': 'orchard-tree-engine',
  'storage-risk': 'storage-risk-engine',
  'irrigation-economics': 'irrigation-economics-engine',
  'frost-pocket': 'frost-pocket-engine',
  'field-workability': 'field-workability-engine',
  'irrigation-distribution': 'irrigation-distribution-engine',
  'water-scarcity': 'water-scarcity-plan-engine',
  'microclimate-sensor': 'microclimate-sensor-engine',
  'multi-stress': 'multi-stress-synthesis',
};

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function uniqueEvidence(values: unknown) {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .map((item) => text(item))
        .filter(Boolean),
    ),
  ).slice(0, 8);
}

function resolveStatus(event: HomeDecisionEvent): ModelSignalStatus {
  const declared = event.signal?.status;
  if (declared === 'error' || declared === 'needs-data' || declared === 'partial') {
    return declared;
  }
  if (event.kind === 'data') return 'needs-data';
  if (declared === 'ready') return 'ready';

  const haystack = `${event.id} ${event.group} ${event.title} ${event.detail}`
    .toLocaleLowerCase('tr-TR');

  if (
    haystack.includes(':error:') ||
    /veri.+hata|yüklenemedi|alınamadı|olmadan.+karar verme/.test(haystack)
  ) {
    return 'error';
  }

  if (
    /bilgi eksik|veri eksik|tamamla|kayıt gerekiyor|needs-data|missing-/.test(haystack)
  ) {
    return 'needs-data';
  }

  if (
    haystack.includes(':loading:') ||
    /hazırlanıyor|hesaplanıyor|veri bekleniyor|henüz karar üretmedi/.test(haystack)
  ) {
    return 'partial';
  }

  return 'ready';
}

function resolveConfidence(
  status: ModelSignalStatus,
  evidence: string[],
  freshness: ModelSignalFreshness,
  explicit?: HomeDecisionConfidence,
): HomeDecisionConfidence {
  if (status !== 'ready' || evidence.length === 0) return 'preliminary';
  if (
    freshness.state === 'stale' ||
    freshness.state === 'invalid' ||
    freshness.state === 'future'
  ) {
    return 'preliminary';
  }
  if (explicit === 'preliminary') return 'preliminary';

  // Açıklama sayısı bağımsız kanıt/model sayısı değildir. Kaynak güçlü güven
  // bildirmedikçe, metin çoğaltılarak güçlü sonuca yükseltme yapılmaz.
  if (explicit === 'strong' && freshness.state === 'current') return 'strong';
  return 'medium';
}

function parseObservedAt(value: unknown): string | null {
  const raw = text(value);

  // Gün veya saat dilimi açık ISO zaman damgası kabul edilir. Yerel saat
  // biçimleri ve Date.parse'ın 30 Şubat gibi normalize ettiği günler reddedilir.
  if (
    !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(
      raw,
    )
  ) {
    return null;
  }

  if (
    raw.length > 10 &&
    (Number(raw.slice(11, 13)) > 23 ||
      Number(raw.slice(14, 16)) > 59 ||
      Number(raw.slice(17, 19)) > 59)
  ) {
    return null;
  }

  const day = raw.slice(0, 10);
  const dayMs = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(dayMs)) return null;

  // Date.parse bazı geçersiz günleri bir sonraki aya taşır. Aynı gün anahtarı
  // geri gelmiyorsa tarih geçersizdir.
  if (new Date(dayMs).toISOString().slice(0, 10) !== day) return null;

  if (raw.length === 10) return new Date(dayMs).toISOString();

  const parsedMs = Date.parse(raw);
  if (!Number.isFinite(parsedMs)) return null;
  return new Date(parsedMs).toISOString();
}

function finitePositive(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function roundHours(value: number) {
  return Number(value.toFixed(1));
}

function buildFreshness(
  event: HomeDecisionEvent,
  evaluatedAt: string,
): { freshness: ModelSignalFreshness; flags: ModelSignalQualityFlag[] } {
  const flags: ModelSignalQualityFlag[] = [];
  const rawObservedAt = event.signal?.observedAt;
  const hasObservedAt = rawObservedAt !== null && rawObservedAt !== undefined && text(rawObservedAt) !== '';
  const observedAt = hasObservedAt ? parseObservedAt(rawObservedAt) : null;
  const maxAgeHours = finitePositive(event.signal?.maxAgeHours);
  const evaluatedMs = Date.parse(evaluatedAt);

  if (!hasObservedAt) flags.push('missing-observation-date');
  else if (!observedAt) flags.push('invalid-observation-date');

  if (maxAgeHours === null) flags.push('missing-freshness-window');

  if (!observedAt || !Number.isFinite(evaluatedMs)) {
    return {
      freshness: {
        observedAt,
        evaluatedAt,
        ageHours: null,
        maxAgeHours,
        state: observedAt ? 'unknown' : hasObservedAt ? 'invalid' : 'unknown',
      },
      flags,
    };
  }

  const observedMs = Date.parse(observedAt);
  if (!Number.isFinite(observedMs)) {
    if (!flags.includes('invalid-observation-date')) flags.push('invalid-observation-date');
    return {
      freshness: {
        observedAt: null,
        evaluatedAt,
        ageHours: null,
        maxAgeHours,
        state: 'invalid',
      },
      flags,
    };
  }

  const ageHours = roundHours((evaluatedMs - observedMs) / 3_600_000);

  // Saat farkı ve seri hale getirme gecikmesi nedeniyle çok küçük ileri zaman
  // sapmalarını toleranslı karşıla; 5 dakikadan büyük gelecek tarih kalite sorunudur.
  if (ageHours < -(5 / 60)) {
    flags.push('future-observation-date');
    return {
      freshness: {
        observedAt,
        evaluatedAt,
        ageHours,
        maxAgeHours,
        state: 'future',
      },
      flags,
    };
  }

  const nonNegativeAge = Math.max(0, ageHours);

  if (maxAgeHours === null) {
    return {
      freshness: {
        observedAt,
        evaluatedAt,
        ageHours: nonNegativeAge,
        maxAgeHours,
        state: 'unknown',
      },
      flags,
    };
  }

  if (nonNegativeAge > maxAgeHours) {
    flags.push('stale-observation');
    return {
      freshness: {
        observedAt,
        evaluatedAt,
        ageHours: nonNegativeAge,
        maxAgeHours,
        state: 'stale',
      },
      flags,
    };
  }

  return {
    freshness: {
      observedAt,
      evaluatedAt,
      ageHours: nonNegativeAge,
      maxAgeHours,
      state: 'current',
    },
    flags,
  };
}

function buildQualityFlags(
  event: HomeDecisionEvent,
  evidence: string[],
  freshnessFlags: ModelSignalQualityFlag[],
): ModelSignalQualityFlag[] {
  const flags = [...freshnessFlags];

  if (evidence.length === 0) flags.push('missing-evidence');
  if (!event.confidence) flags.push('confidence-not-declared');

  return Array.from(new Set(flags));
}

export function harmonizeDecisionEvent(
  event: HomeDecisionEvent,
  fieldId: unknown,
  evaluatedAt = new Date().toISOString(),
): HarmonizedHomeDecisionEvent {
  const evidence = uniqueEvidence(event.evidence);
  const status = resolveStatus(event);
  const { freshness, flags: freshnessFlags } = buildFreshness(event, evaluatedAt);
  const flags = buildQualityFlags(event, evidence, freshnessFlags);

  const gateway: ModelGatewayEnvelope = {
    schemaVersion: '1.0',
    signalId: event.id,
    fieldId: text(fieldId) || String(fieldId ?? '').trim(),
    source: event.source,
    sourceModel: text(event.sourceModel) || SOURCE_MODELS[event.source],
    status,
    confidence: resolveConfidence(status, evidence, freshness, event.confidence),
    evidence,
    quality: {
      declaredConfidence: event.confidence ?? null,
      evidenceCount: evidence.length,
      flags,
    },
    freshness,
    authority: resolveScientificAuthority(
      event.source,
      text(event.sourceModel) || SOURCE_MODELS[event.source],
    ),
    recommendation: {
      title: event.title,
      detail: event.detail,
      target: event.target,
    },
    severity: event.severity,
    priority: event.priority,
  };

  return {
    ...event,
    evidence,
    gateway,
  };
}

export function harmonizeDecisionEvents(
  events: HomeDecisionEvent[],
  fieldId: unknown,
  evaluatedAt = new Date().toISOString(),
): HarmonizedHomeDecisionEvent[] {
  return events.map((event) =>
    harmonizeDecisionEvent(event, fieldId, evaluatedAt),
  );
}
