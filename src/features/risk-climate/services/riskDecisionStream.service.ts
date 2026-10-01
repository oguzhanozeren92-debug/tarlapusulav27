import type { HomeDecisionEvent } from '../../decision/types/homeDecision';

export type CompactRiskClimateSignal = {
  key?:
    | 'frost'
    | 'heat'
    | 'drought'
    | 'excess_water'
    | 'salinity'
    | 'hail_post_event'
    | 'disease_weather_window'
    | string;
  label?: string | null;
  status?: 'ready' | 'supporting' | 'needs_data' | 'unavailable' | string;
  level?: 'low' | 'moderate' | 'high' | 'critical' | 'unknown' | string;
  score?: number | null;
  baseScore?: number | null;
  headline?: string | null;
  summary?: string | null;
  evidence?: string[] | null;
  action?: string | null;
  confidence?: 'low' | 'medium' | 'high' | 'unknown' | string;
  sensitivity?: {
    cropName?: string | null;
    phenologyStage?: string | null;
    phenologyStageLabel?: string | null;
    factor?: number | null;
    applied?: boolean;
    reason?: string | null;
  } | null;
};

export type CompactRiskClimateIntelligence = {
  version?: string;
  status?: 'ready' | 'partial' | 'needs_data' | string;
  topSignal?: CompactRiskClimateSignal | null;
  signals?: CompactRiskClimateSignal[] | null;
  generatedAt?: string | null;
} | null;

type RiskFamily = 'frost' | 'heat' | 'drought' | 'excess-water' | 'disease' | null;

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

function finite(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function localDayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function unique(values: Array<string | null | undefined>, limit = 8) {
  return [...new Set(values.map(text).filter(Boolean))].slice(0, limit);
}

function familyFromClimateKey(value: unknown): RiskFamily {
  const key = normalize(value);
  if (key === 'frost') return 'frost';
  if (key === 'heat') return 'heat';
  if (key === 'drought') return 'drought';
  if (key === 'excess_water') return 'excess-water';
  if (key === 'disease_weather_window') return 'disease';
  return null;
}

function eventRiskFamily(event: HomeDecisionEvent): RiskFamily {
  const haystack = normalize([
    event.id,
    event.group,
    event.label,
    event.title,
    event.detail,
  ].join(' '));

  if (/\b(frost|don)\b/.test(haystack)) return 'frost';
  if (/\b(heat|isi stresi|sicaklik stresi|asiri sicak)\b/.test(haystack)) return 'heat';
  if (/\b(rainfed stress|rainfed-stress|su stresi|su acigi|kuraklik|kurak)\b/.test(haystack)) {
    return 'drought';
  }
  if (/\b(excess water|fazla su|drenaj|su birik|gollen)\b/.test(haystack)) {
    return 'excess-water';
  }
  if (
    event.source === 'risk-radar' ||
    event.group === 'risk-radar' ||
    event.group === 'plant-health-risk'
  ) {
    return 'disease';
  }

  return null;
}

function titleForSignal(signal: CompactRiskClimateSignal, danger: boolean) {
  const key = String(signal.key ?? '');
  if (key === 'frost') return danger ? 'Don Riski Yüksek' : 'Don Riskini Takip Et';
  if (key === 'heat') return danger ? 'Sıcaklık Stresi Yüksek' : 'Sıcaklık Stresini Takip Et';
  if (key === 'drought') return danger ? 'Su Açığı Riski Yüksek' : 'Su Açığını Takip Et';
  if (key === 'excess_water') {
    return danger ? 'Fazla Su / Drenaj Riski Yüksek' : 'Drenaj Riskini Takip Et';
  }
  return danger
    ? `${text(signal.label) || 'İklim'} Riski Yüksek`
    : `${text(signal.label) || 'İklim'} Riskini Takip Et`;
}

function labelForSignal(key: string) {
  if (key === 'frost') return 'DON RİSKİ';
  if (key === 'heat') return 'ISI STRESİ';
  if (key === 'drought') return 'SU AÇIĞI';
  if (key === 'excess_water') return 'FAZLA SU / DRENAJ';
  return 'İKLİM RİSKİ';
}

function targetForSignal(key: string): HomeDecisionEvent['target'] {
  return key === 'drought' ? 'irrigation_detail' : 'weather';
}

function confidenceForSignal(
  value: CompactRiskClimateSignal['confidence'],
): HomeDecisionEvent['confidence'] {
  if (value === 'high') return 'strong';
  if (value === 'medium') return 'medium';
  return 'preliminary';
}

/**
 * 12.3 — Risk & İklim Zekâsı tek karar projeksiyonu.
 *
 * Climate Intelligence yeni bir risk hesabı yapmaz. 12.2'de üretilmiş
 * ürün/fenoloji duyarlı karar skorunu Home Decision Event'e çevirir.
 * Hastalık hava penceresi ise zaten Risk Radar'ın bitki-sağlığı kararından
 * geldiği için burada ikinci bir olay üretmez.
 */
export function buildRiskClimateDecision(
  fieldId: string | number | null | undefined,
  intelligence: CompactRiskClimateIntelligence,
  now = new Date(),
): HomeDecisionEvent | null {
  if (!fieldId || !intelligence?.topSignal) return null;

  const signal = intelligence.topSignal;
  const key = String(signal.key ?? '');
  const family = familyFromClimateKey(key);
  const score = finite(signal.score);
  const baseScore = finite(signal.baseScore);
  const level = String(signal.level ?? 'unknown');
  const status = String(signal.status ?? '');

  if (!family || family === 'disease') return null;
  if (status === 'needs_data' || status === 'unavailable') return null;
  if (score == null || score < 35 || level === 'low' || level === 'unknown') return null;

  const danger = level === 'critical' || level === 'high';
  const sensitivityApplied = Boolean(signal.sensitivity?.applied);
  const scoreText = sensitivityApplied && baseScore != null && baseScore !== score
    ? `Ham iklim skoru %${Math.round(baseScore)}; ürün/fenoloji hassasiyeti sonrası karar skoru %${Math.round(score)}.`
    : `Karar skoru %${Math.round(score)}.`;

  const detail = unique([
    signal.headline,
    scoreText,
    signal.action,
  ], 3).join(' ');

  const waterVisual = key === 'drought' || key === 'excess_water';
  const dayKey = localDayKey(now);

  return {
    id: `risk-climate:${String(fieldId)}:${key}:${level}:${dayKey}`,
    group: `risk-climate-${key}`,
    source: 'risk-radar',
    sourceModel: `risk-climate-intelligence-${intelligence.version || 'v12.3'}`,
    priority: level === 'critical' ? 120 : level === 'high' ? 113 : 97,
    severity: danger ? 'danger' : 'warning',
    confidence: confidenceForSignal(signal.confidence),
    kind: 'check',
    target: targetForSignal(key),
    channels: ['today', 'notification', 'pusula'],
    label: labelForSignal(key),
    title: titleForSignal(signal, danger),
    detail,
    evidence: unique([
      ...(Array.isArray(signal.evidence) ? signal.evidence : []),
      signal.sensitivity?.reason,
      'İklim risk skoru kesin teşhis veya otomatik uygulama talimatı değildir.',
    ]),
    today: {
      tone: danger ? 'red' : key === 'frost' ? 'blue' : 'amber',
      visual: waterVisual ? 'irrigation' : 'spraying',
      iconKey: waterVisual ? 'water' : key === 'frost' ? 'rain' : 'leaf-gold',
      iconClass: waterVisual || key === 'frost' ? 'water' : 'leaf',
    },
    notification: {
      iconKey: waterVisual || key === 'frost' ? 'rain' : 'leaf',
      iconTone: waterVisual || key === 'frost' ? 'cyan' : 'gold',
      dotTone: danger ? 'danger' : 'warning',
    },
  };
}

/**
 * Aynı gerçek riski farklı adaptörler ayrı cümlelerle üretmişse tek karara
 * indirger. Kanonik kararın channels alanı Today + Notification + Pusula'yı
 * zaten birlikte besler; böylece üç ayrı kopya oluşturulmaz.
 */
export function collapseRiskDecisionEvents(
  events: HomeDecisionEvent[],
  canonicalRiskEvent: HomeDecisionEvent | null | undefined,
): HomeDecisionEvent[] {
  if (!canonicalRiskEvent) return events;

  const canonicalFamily = eventRiskFamily(canonicalRiskEvent);
  if (!canonicalFamily) return events;

  const canonicalId = canonicalRiskEvent.id;

  return events.filter((event) => {
    if (event.id === canonicalId) return true;

    const family = eventRiskFamily(event);
    if (family !== canonicalFamily) return true;

    // Don ve sıcaklık: ham Weather kartı yerine ürün/fenoloji duyarlı ortak risk.
    if (
      (canonicalFamily === 'frost' || canonicalFamily === 'heat') &&
      event.source === 'weather' &&
      event.group === 'temperature-risk'
    ) {
      return false;
    }

    // Kuraklık/su açığı: yalnız rainfed-stress kopyasını bastır; gerçek sulama
    // kararı (irrigate_now vb.) ayrı karar otoritesidir ve korunur.
    if (
      canonicalFamily === 'drought' &&
      event.source === 'irrigation' &&
      (event.id.includes('rainfed-stress') || normalize(event.label).includes('su stresi'))
    ) {
      return false;
    }

    // Aynı Risk Radar ailesinden ikinci bir risk kartı/bildirimi üretme.
    if (
      event.source === 'risk-radar' &&
      (event.group === 'risk-radar' || event.group === 'plant-health-risk' || event.group.startsWith('risk-climate-'))
    ) {
      return false;
    }

    return true;
  });
}
