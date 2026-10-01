import type { HomeDecisionEvent } from '../../decision/types/homeDecision';
import type {
  MultiStressConfidence,
  MultiStressFamily,
  MultiStressFamilySignal,
  MultiStressSynthesis,
} from '../types/multiStress';

type Candidate = {
  family: MultiStressFamily;
  event: HomeDecisionEvent;
};

const LABELS: Record<MultiStressFamily, string> = {
  water_deficit: 'Su açığı / su ulaşımı',
  water_excess: 'Fazla su / drenaj',
  heat: 'Isı stresi',
  frost: 'Don / düşük sıcaklık',
  nutrition: 'Besin / toprak stresi',
  disease_pest: 'Hastalık / zararlı baskısı',
  weed: 'Yabancı ot baskısı',
  salinity: 'Tuzluluk stresi',
};

function text(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalize(value: unknown) {
  return text(value)
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i');
}

function unique(values: Array<string | null | undefined>, limit = 12) {
  return [...new Set(values.map(text).filter(Boolean))].slice(0, limit);
}

function confidenceRank(value: HomeDecisionEvent['confidence']): number {
  if (value === 'strong') return 3;
  if (value === 'medium') return 2;
  return 1;
}

function toConfidence(rank: number): MultiStressConfidence {
  if (rank >= 3) return 'strong';
  if (rank >= 2) return 'medium';
  return 'preliminary';
}

function severityRank(event: HomeDecisionEvent) {
  return event.severity === 'danger' ? 3 : event.severity === 'warning' ? 2 : 0;
}

function isUsableStressEvent(event: HomeDecisionEvent) {
  if (event.severity === 'info') return false;
  if (event.kind === 'data') return false;
  if (event.signal?.status === 'needs-data' || event.signal?.status === 'error') return false;
  if (event.group.endsWith('-status')) return false;
  if (event.group === 'storage-risk' || event.source === 'storage-risk') return false;
  if (event.source === 'irrigation-economics' || event.source === 'yield-harvest') return false;
  return true;
}

function classifyEvent(event: HomeDecisionEvent): MultiStressFamily | null {
  if (!isUsableStressEvent(event)) return null;

  const haystack = normalize([
    event.id,
    event.group,
    event.source,
    event.sourceModel,
    event.label,
    event.title,
    event.detail,
    ...(event.evidence ?? []),
  ].join(' '));

  if (event.source === 'weed-intelligence') return 'weed';
  if (event.source === 'nutrition') return 'nutrition';
  if (
    event.source === 'risk-radar' &&
    (event.group === 'risk-radar' || event.group === 'plant-health-risk')
  ) {
    return 'disease_pest';
  }
  if (event.source === 'frost-pocket') return 'frost';
  if (event.source === 'water-scarcity') return 'water_deficit';
  if (event.source === 'irrigation-distribution') return 'water_deficit';
  if (event.source === 'microclimate-sensor' && /debi|basinc|pressure|flow|hidrolik/.test(haystack)) return 'water_deficit';

  if (/tuzluluk|salinity|salin/.test(haystack)) return 'salinity';
  if (/fazla su|excess water|drenaj|gollen|su birik|waterlog/.test(haystack)) {
    return 'water_excess';
  }
  if (/don riski|don cebi|frost|cok dusuk sicaklik|dusuk sicaklik/.test(haystack)) {
    return 'frost';
  }
  if (/isi stresi|heat|asiri sicak|yuksek sicaklik|sicaklik stresi/.test(haystack)) {
    return 'heat';
  }
  if (/su kitligi|su acigi|su stresi|kuraklik|kurak|irrigate_now|sulama dagilim/.test(haystack)) {
    return 'water_deficit';
  }
  if (/besin|nutrient|azot|fosfor|potasyum|toprak stresi/.test(haystack)) {
    return 'nutrition';
  }
  if (/yabanci ot|weed/.test(haystack)) return 'weed';
  if (/hastalik|zararli|fungal|mantar|risk radar/.test(haystack)) return 'disease_pest';

  return null;
}

function observedAt(event: HomeDecisionEvent) {
  const raw = text(event.signal?.observedAt);
  return raw || null;
}

function eventScore(event: HomeDecisionEvent) {
  const severity = severityRank(event);
  const confidence = confidenceRank(event.confidence);
  const evidenceBonus = (event.evidence?.length ?? 0) > 0 ? 1 : 0;
  const priorityBonus = event.priority >= 100 ? 2 : event.priority >= 85 ? 1 : 0;
  return severity * 10 + confidence * 3 + evidenceBonus + priorityBonus;
}

function aggregateFamily(family: MultiStressFamily, events: HomeDecisionEvent[]): MultiStressFamilySignal {
  const sorted = [...events].sort((a, b) => eventScore(b) - eventScore(a));
  const strongest = sorted[0];
  const maxConfidence = Math.max(...sorted.map((item) => confidenceRank(item.confidence)));
  const maxSeverity = Math.max(...sorted.map(severityRank));
  const latestObservedAt = sorted
    .map(observedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;

  return {
    family,
    label: LABELS[family],
    level: maxSeverity >= 3 ? 'danger' : 'warning',
    confidence: toConfidence(maxConfidence),
    score: eventScore(strongest),
    sources: unique(sorted.map((item) => item.source), 6),
    sourceModels: unique(sorted.map((item) => item.sourceModel), 8),
    eventIds: unique(sorted.map((item) => item.id), 8),
    evidence: unique(
      sorted.flatMap((item) => [
        `${item.title}: ${item.detail}`,
        ...(item.evidence ?? []).slice(0, 2),
      ]),
      8,
    ),
    observedAt: latestObservedAt,
  };
}

function conflictingFamilies(signals: MultiStressFamilySignal[]) {
  const families = new Set(signals.map((item) => item.family));
  return (
    (families.has('water_deficit') && families.has('water_excess')) ||
    (families.has('heat') && families.has('frost'))
  );
}

function satelliteSupport(events: HomeDecisionEvent[]) {
  return unique(
    events
      .filter((event) => event.source === 'satellite' && event.severity !== 'info')
      .flatMap((event) => [
        `${event.title}: ${event.detail}`,
        ...(event.evidence ?? []).slice(0, 2),
      ]),
    5,
  );
}

export function buildMultiStressSynthesis(
  fieldIdInput: string | number | null | undefined,
  events: HomeDecisionEvent[],
  now = new Date(),
): MultiStressSynthesis {
  const fieldId = String(fieldIdInput ?? '').trim();
  const candidates: Candidate[] = [];

  for (const event of events) {
    if (event.group === 'multi-stress-synthesis' || event.source === 'multi-stress') continue;
    const family = classifyEvent(event);
    if (family) candidates.push({ family, event });
  }

  const byFamily = new Map<MultiStressFamily, HomeDecisionEvent[]>();
  for (const candidate of candidates) {
    const bucket = byFamily.get(candidate.family) ?? [];
    bucket.push(candidate.event);
    byFamily.set(candidate.family, bucket);
  }

  const signals = [...byFamily.entries()]
    .map(([family, familyEvents]) => aggregateFamily(family, familyEvents))
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, 'tr'));

  const support = satelliteSupport(events);
  const conflict = conflictingFamilies(signals);
  const status: MultiStressSynthesis['status'] =
    signals.length < 2 ? 'none' : conflict ? 'conflicted' : 'combined';

  const top = signals[0] ?? null;
  const second = signals[1] ?? null;
  const dominantFamily =
    status === 'combined' && top && second && top.score >= second.score + 2
      ? top.family
      : status === 'combined' && top && !second
        ? top.family
        : null;

  const secondaryFamilies = signals
    .filter((item) => item.family !== dominantFamily)
    .map((item) => item.family);

  const maxConfidence = signals.length
    ? Math.max(...signals.map((item) => confidenceRank(item.confidence)))
    : 1;
  const hasPreliminary = signals.some((item) => item.confidence === 'preliminary');
  const confidence = status === 'none'
    ? 'preliminary'
    : conflict || hasPreliminary
      ? 'preliminary'
      : toConfidence(maxConfidence);

  const dominantLabel = dominantFamily ? LABELS[dominantFamily] : null;
  const otherLabels = secondaryFamilies.map((family) => LABELS[family]).slice(0, 3);

  const headline = status === 'none'
    ? 'Birleşik stres için en az iki bağımsız sinyal gerekli'
    : status === 'conflicted'
      ? 'Stres sinyalleri birbiriyle çelişiyor'
      : dominantLabel
        ? `${dominantLabel} baskın; eşlik eden stres sinyalleri var`
        : 'Birden fazla stres aynı anda izleniyor';

  const summary = status === 'none'
    ? 'Mevcut karar akışında aynı anda iki bağımsız stres ailesi oluşmadı; Pusula tek bir indeksten çoklu stres üretmedi.'
    : status === 'conflicted'
      ? `Aynı zaman penceresinde ${signals.map((item) => item.label).join(', ')} sinyalleri var. Çelişkili stresler tek nedene indirgenmedi.`
      : dominantLabel
        ? `${dominantLabel} mevcut kanıt içinde daha güçlü görünüyor; ${otherLabels.join(', ')} eşlik eden sinyal olarak tutuluyor. Bu sıralama kesin neden teşhisi değildir.`
        : `${signals.map((item) => item.label).join(', ')} birlikte görülüyor; kanıtlar baskın tek nedeni güvenle ayırmıyor.`;

  const action = status === 'none'
    ? 'Alt karar motorlarını izlemeye devam et.'
    : status === 'conflicted' || !dominantFamily
      ? 'Önce saha kontrolüyle belirtileri ve toprak/su koşulunu doğrula; birbirine zıt sinyaller çözülmeden tek bir müdahale seçme.'
      : `Önce ${dominantLabel.toLocaleLowerCase('tr-TR')} için ilgili üretim kararını uygula veya doğrula; eşlik eden stresleri aynı saha kontrolünde ayrı ayrı kontrol et.`;

  const synthesisEvidence = unique([
    ...signals.flatMap((signal) => [
      `${signal.label}: ${signal.level === 'danger' ? 'yüksek' : 'dikkat'} · ${signal.confidence}`,
      ...signal.evidence.slice(0, 2),
    ]),
    ...support.map((item) => `Uydu destek kanıtı: ${item}`),
  ], 14);

  const warnings = unique([
    'Birleşik stres sentezi yeni bir hastalık, besin eksikliği veya su stresi teşhisi üretmez; alt motorların mevcut kararlarını birlikte yorumlar.',
    'Uydu anomalisi tek başına ayrı bir stres nedeni sayılmaz; yalnız diğer kararları destekleyen bağlamdır.',
    conflict ? 'Birbiriyle zıt stres sinyalleri mevcut; saha doğrulaması yapılmadan baskın neden seçilmedi.' : null,
    confidence === 'preliminary' && status !== 'none'
      ? 'En az bir stres ailesinin güveni ön değerlendirme düzeyinde; sentez güveni yükseltilmedi.'
      : null,
  ]);

  const latestObservedAt = signals
    .map((item) => item.observedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;

  return {
    version: '26.0',
    fieldId,
    status,
    dominantFamily,
    secondaryFamilies,
    signals,
    supportingSatelliteEvidence: support,
    headline,
    summary,
    action,
    evidence: synthesisEvidence,
    warnings,
    confidence,
    observedAt: latestObservedAt,
    generatedAt: now.toISOString(),
    productionAuthority: false,
  };
}
