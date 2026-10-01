import type { HomeDecisionEvent } from '../types/homeDecision';
import {
  buildRiskClimateDecision,
  type CompactRiskClimateIntelligence,
} from '../../risk-climate/services/riskDecisionStream.service';

type RiskRadarLevel = 'low' | 'moderate' | 'high' | 'critical';

type RiskRadarCompact = {
  supported?: boolean;
  overall?: {
    score?: number;
    level?: RiskRadarLevel;
    levelLabel?: string;
    headline?: string;
    recommendation?: string;
  } | null;
  topThreats?: Array<{
    name?: string;
    score?: number;
    level?: RiskRadarLevel;
    peakScore7d?: number;
    peakDate?: string | null;
    trend?: string;
    reasons?: string[];
    action?: string;
  }>;
  climateIntelligence?: CompactRiskClimateIntelligence;
  regionalPestDisease?: {
    status?: 'ready' | 'no_signal' | 'needs_data' | 'unavailable';
    radiusKm?: number;
    lookbackDays?: number;
    topSignal?: {
      threatKey?: string;
      commonName?: string | null;
      scientificName?: string | null;
      threatType?: string;
      observationCount?: number;
      sourceCount?: number;
      nearestDistanceKm?: number | null;
      newestObservedOn?: string | null;
      pressureScore?: number;
      level?: 'none' | 'watch' | 'elevated' | 'high';
      evidence?: string[];
    } | null;
    diagnosisAuthority?: false;
    chemicalPrescriptionAuthority?: false;
  } | null;
  intelligence?: {
    status?: 'ready' | 'partial' | 'needs_data';
    decisionStatus?:
      | 'no_signal'
      | 'watch'
      | 'elevated'
      | 'field_evidence'
      | 'conflict'
      | 'unsupported_model'
      | 'needs_data';
    confidence?: 'low' | 'medium' | 'high' | 'unknown';
    topThreat?: string | null;
    topThreatType?: string | null;
    riskScore?: number | null;
    riskLevel?: RiskRadarLevel | 'unknown';
    headline?: string;
    summary?: string;
    action?: string;
    diagnosisAuthority?: false;
    photoEvidence?: {
      issueType?: string | null;
      status?: string | null;
      severity?: string | null;
      possibleIssue?: string | null;
      confidencePercent?: number | null;
      trend?: string | null;
      needsMoreEvidence?: boolean;
    } | null;
    fieldObservations?: {
      active_point_count?: number;
      worsening_point_count?: number;
      improving_point_count?: number;
      interpretation?: string | null;
    } | null;
    conflicts?: Array<{
      type?: string;
      note?: string;
      [key: string]: unknown;
    }>;
    missingInputs?: string[];
    generatedAt?: string;
  } | null;
  generatedAt?: string;
} | null;

function text(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function localDayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function displayDate(value: string | null | undefined) {
  if (!value) return '';
  const parsed = new Date(`${value}T12:00:00`);
  if (!Number.isFinite(parsed.getTime())) return text(value);

  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
  }).format(parsed);
}

function safeKey(value: string) {
  return value
    .toLocaleLowerCase('tr-TR')
    .replace(/[^a-z0-9çğıöşü]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'risk';
}

function compactUnique(values: Array<string | null | undefined>, limit = 8) {
  return [...new Set(values.map(text).filter(Boolean))].slice(0, limit);
}

function normalizedThreat(value: unknown) {
  return text(value)
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function sameThreat(left: unknown, right: unknown) {
  const a = normalizedThreat(left);
  const b = normalizedThreat(right);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function regionalThreatName(radar: NonNullable<RiskRadarCompact>) {
  const signal = radar.regionalPestDisease?.topSignal;
  return text(signal?.commonName) || text(signal?.scientificName) || text(signal?.threatKey) || 'Hastalık / zararlı';
}

function buildRegionalDecision(
  fieldId: string | number,
  radar: NonNullable<RiskRadarCompact>,
  now: Date,
): HomeDecisionEvent | null {
  const regional = radar.regionalPestDisease;
  const signal = regional?.topSignal;
  if (!regional || regional.status !== 'ready' || !signal) return null;
  if (signal.level !== 'high' && signal.level !== 'elevated') return null;

  const threatName = regionalThreatName(radar);
  const distance = signal.nearestDistanceKm == null ? null : finiteNumber(signal.nearestDistanceKm);
  const observations = Math.max(0, Math.round(finiteNumber(signal.observationCount) ?? 0));
  const sources = Math.max(0, Math.round(finiteNumber(signal.sourceCount) ?? 0));
  const high = signal.level === 'high';
  const dayKey = localDayKey(now);

  return {
    id: `regional-risk:${String(fieldId)}:${safeKey(threatName)}:${signal.level}:${dayKey}`,
    group: 'risk-radar',
    source: 'risk-radar',
    sourceModel: 'risk-radar+regional-observation-aggregate-v17',
    priority: high ? 105 : 94,
    severity: 'warning',
    confidence: observations >= 3 && sources >= 2 ? 'medium' : 'preliminary',
    kind: 'check',
    target: 'ai',
    channels: high ? ['today', 'notification', 'pusula'] : ['notification', 'pusula'],
    label: 'BÖLGESEL RADAR',
    title: `${threatName} İçin Yakın Çevre Sinyali`,
    detail: compactUnique([
      observations ? `${observations} doğrulanmış/güvenilir bölgesel kayıt toplandı.` : null,
      distance != null ? `En yakın kayıt yaklaşık ${distance < 10 ? distance.toFixed(1) : Math.round(distance)} km.` : null,
      signal.newestObservedOn ? `En yeni kayıt ${signal.newestObservedOn}.` : null,
      'Bu sinyal tarlada hastalık/zararlı varlığını kanıtlamaz; yalnız saha kontrolünü önceliklendirir.',
      'Bölgesel sinyalden otomatik ilaçlama veya kimyasal reçete üretilmez.',
    ], 5).join(' '),
    evidence: compactUnique([
      ...(signal.evidence ?? []),
      'Bölgesel baskı skoru olasılık değildir.',
      'Kesin teşhis için tarla içi bulgu gerekir.',
    ]),
    today: high ? {
      tone: 'amber',
      visual: 'spraying',
      iconKey: 'leaf-green',
      iconClass: 'leaf',
    } : undefined,
    notification: {
      iconKey: 'leaf',
      iconTone: 'green',
      dotTone: 'warning',
    },
  };
}

function addMatchingRegionalEvidence(
  event: HomeDecisionEvent | null,
  radar: NonNullable<RiskRadarCompact>,
): HomeDecisionEvent | null {
  if (!event) return null;
  const signal = radar.regionalPestDisease?.topSignal;
  if (!signal) return event;
  const regionalName = regionalThreatName(radar);
  const eventThreat = text(radar.intelligence?.topThreat) || text(radar.topThreats?.[0]?.name) || event.title;
  if (!sameThreat(eventThreat, regionalName)) return event;

  const evidence = compactUnique([
    ...(event.evidence ?? []),
    ...(signal.evidence ?? []),
    'Bölgesel kayıt yerel risk sinyalini destekleyebilir ancak tarlada varlığı kanıtlamaz.',
  ]);
  return {
    ...event,
    sourceModel: `${text(event.sourceModel) || 'risk-radar'}+regional-observation-aggregate-v17`,
    evidence,
    detail: compactUnique([
      event.detail,
      `Yakın çevrede ${regionalName} için doğrulanmış/güvenilir bölgesel kayıtlar da var; saha kontrolünü öne al.`,
    ], 2).join(' '),
  };
}

function buildIntelligenceDecision(
  fieldId: string | number,
  radar: NonNullable<RiskRadarCompact>,
  now: Date,
): HomeDecisionEvent | null {
  const intel = radar.intelligence;
  if (!intel) return null;

  const status = intel.decisionStatus;
  if (
    !status ||
    status === 'no_signal' ||
    status === 'unsupported_model' ||
    status === 'needs_data'
  ) {
    return null;
  }

  const level = intel.riskLevel;
  const environmentalDanger =
    level === 'critical' || level === 'high';
  const isConflict = status === 'conflict';
  const isFieldEvidence = status === 'field_evidence';
  const isElevated = status === 'elevated';
  const isWatch = status === 'watch';

  const threatName =
    text(intel.topThreat) ||
    text(intel.photoEvidence?.possibleIssue) ||
    text(radar.topThreats?.[0]?.name) ||
    'Bitki sağlığı';

  const score =
    finiteNumber(intel.riskScore) ??
    finiteNumber(radar.overall?.score);
  const firstThreat = radar.topThreats?.[0];
  const peakScore = finiteNumber(firstThreat?.peakScore7d);
  const peakDate = displayDate(firstThreat?.peakDate);
  const worseningPoints =
    finiteNumber(intel.fieldObservations?.worsening_point_count) ?? 0;

  const scoreDetail =
    score != null
      ? `Çevresel risk skoru %${Math.round(score)}.`
      : '';
  const peakDetail =
    peakScore != null &&
    score != null &&
    peakScore > score
      ? `7 günlük tepe risk %${Math.round(peakScore)}${peakDate ? ` · ${peakDate}` : ''}.`
      : '';
  const fieldDetail =
    worseningPoints > 0
      ? `${Math.round(worseningPoints)} izleme noktasında sağlık gerilemesi var.`
      : '';

  const title = isConflict
    ? 'Saha ve Model Sinyalleri Ayrışıyor'
    : isFieldEvidence
      ? `${threatName} Bulgusunu Sahada Doğrula`
      : isElevated
        ? `${threatName} Riski Yükseldi`
        : isWatch
          ? `${threatName} Riskini Takip Et`
          : text(intel.headline) || 'Bitki Sağlığını Kontrol Et';

  const detail = compactUnique([
    scoreDetail,
    peakDetail,
    fieldDetail,
    intel.summary,
    intel.action,
    'Bu değerlendirme risk/ön bulgudur; kesin teşhis veya otomatik ilaçlama talimatı değildir.',
  ], 6).join(' ');

  const conflictEvidence = (intel.conflicts ?? [])
    .map((item) => text(item?.note))
    .filter(Boolean);

  const photoEvidence = intel.photoEvidence
    ? compactUnique([
        intel.photoEvidence.status
          ? `Fotoğraf ön değerlendirme durumu: ${intel.photoEvidence.status}.`
          : null,
        intel.photoEvidence.confidencePercent != null
          ? `Görsel güven: %${Math.round(intel.photoEvidence.confidencePercent)}.`
          : null,
        intel.photoEvidence.trend &&
        intel.photoEvidence.trend !== 'unknown'
          ? `Fotoğraf trendi: ${intel.photoEvidence.trend}.`
          : null,
      ], 3)
    : [];

  const severity: HomeDecisionEvent['severity'] =
    environmentalDanger && !isConflict
      ? 'danger'
      : 'warning';

  const confidence: HomeDecisionEvent['confidence'] =
    intel.confidence === 'high'
      ? 'strong'
      : intel.confidence === 'medium'
        ? 'medium'
        : 'preliminary';

  const dayKey = localDayKey(now);

  return {
    id: `risk-intelligence:${String(fieldId)}:${safeKey(threatName)}:${status}:${dayKey}`,
    group: 'plant-health-risk',
    source: 'risk-radar',
    sourceModel: 'risk-radar+field-evidence+phenology+satellite',
    priority:
      isConflict
        ? 116
        : environmentalDanger
          ? 112
          : isFieldEvidence
            ? 108
            : 98,
    severity,
    confidence,
    kind: 'check',
    target: 'ai',
    channels: ['today', 'notification', 'pusula'],
    label: isConflict
      ? 'PUSULA SAHA KONTROLÜ'
      : isFieldEvidence
        ? 'SAHA BULGUSU'
        : 'RİSK RADARI',
    title,
    detail,
    evidence: compactUnique([
      ...(firstThreat?.reasons ?? []),
      ...photoEvidence,
      fieldDetail,
      ...conflictEvidence,
      'Risk skoru hastalık teşhisi değildir.',
    ]),
    today: {
      tone: severity === 'danger' ? 'red' : 'amber',
      visual: 'spraying',
      iconKey: 'leaf-green',
      iconClass: 'leaf',
    },
    notification: {
      iconKey: 'leaf',
      iconTone: severity === 'danger' ? 'gold' : 'green',
      dotTone: severity === 'danger' ? 'danger' : 'warning',
    },
  };
}

/**
 * Madde 7 ile Risk Radar artık yalnız hava riskini değil, sunucuda
 * birleştirilmiş saha fotoğrafı + izleme noktaları + fenoloji + uydu
 * kanıtlarını da taşır. Sunucu intelligence çıktısı varsa onu kullanır;
 * eski sunucu yanıtlarında geriye dönük uyumluluk için çevresel radar
 * adaptörü fallback olarak kalır.
 */
export function buildRiskRadarDecision(
  fieldId: string | number | null | undefined,
  radar: RiskRadarCompact,
  now = new Date(),
): HomeDecisionEvent | null {
  if (!fieldId || !radar) return null;

  const intelligenceDecision = buildIntelligenceDecision(
    fieldId,
    radar,
    now,
  );

  // Gerçek saha/fotoğraf kanıtı veya model-saha çatışması varsa çevresel
  // iklim sinyalinden daha yüksek kanıt otoritesine sahiptir.
  const intelligenceStatus = radar.intelligence?.decisionStatus;
  if (
    intelligenceDecision &&
    (intelligenceStatus === 'field_evidence' || intelligenceStatus === 'conflict')
  ) {
    return addMatchingRegionalEvidence(intelligenceDecision, radar);
  }

  // 12.3: Don / sıcaklık / kuraklık / fazla su için tek kanonik karar.
  // disease_weather_window burada ikinci olaya dönüşmez; aşağıdaki Risk Radar
  // bitki-sağlığı kararı aynı hastalık sinyalinin tek sahibi olmaya devam eder.
  const climateDecision = buildRiskClimateDecision(
    fieldId,
    radar.climateIntelligence ?? null,
    now,
  );
  if (climateDecision) return climateDecision;

  if (radar.intelligence) return addMatchingRegionalEvidence(intelligenceDecision, radar) ?? buildRegionalDecision(fieldId, radar, now);

  if (!radar.supported || !radar.overall) return buildRegionalDecision(fieldId, radar, now);

  const level = radar.overall.level;
  if (!level || level === 'low') return buildRegionalDecision(fieldId, radar, now);

  const threat = radar.topThreats?.[0];
  if (!threat) return buildRegionalDecision(fieldId, radar, now);

  const threatName = text(threat.name) || 'Hastalık / zararlı';
  const score = finiteNumber(threat.score ?? radar.overall.score);
  const peakScore = finiteNumber(threat.peakScore7d);
  const peakDate = displayDate(threat.peakDate);
  const isDanger = level === 'critical' || level === 'high';
  const dayKey = localDayKey(now);

  const peakDetail =
    peakScore != null && score != null && peakScore > score
      ? `7 günlük tepe risk %${Math.round(peakScore)}${peakDate ? ` · ${peakDate}` : ''}.`
      : '';

  const action = text(threat.action || radar.overall.recommendation);
  const headline = text(radar.overall.headline);
  const detail = compactUnique([
    score != null ? `Risk skoru %${Math.round(score)}.` : '',
    peakDetail,
    action || headline,
    'Bu iklimsel erken uyarıdır; kesin teşhis veya ilaçlama talimatı değildir.',
  ], 4).join(' ');

  const localDecision: HomeDecisionEvent = {
    id: `risk-radar:${String(fieldId)}:${safeKey(threatName)}:${level}:${dayKey}`,
    group: 'risk-radar',
    source: 'risk-radar',
    sourceModel: 'risk-radar-legacy-fallback',
    priority: level === 'critical' ? 118 : level === 'high' ? 110 : 97,
    severity: isDanger ? 'danger' : 'warning',
    confidence: 'preliminary',
    kind: 'check',
    target: 'ai',
    channels: ['today', 'notification', 'pusula'],
    label: 'RİSK RADARI',
    title: isDanger
      ? `${threatName} Riski Yüksek`
      : `${threatName} Riskini Takip Et`,
    detail,
    evidence: compactUnique([
      ...(threat.reasons ?? []),
      'Risk skoru hastalık teşhisi değildir.',
    ], 3),
    today: {
      tone: isDanger ? 'red' : 'amber',
      visual: 'spraying',
      iconKey: 'leaf-green',
      iconClass: 'leaf',
    },
    notification: {
      iconKey: 'leaf',
      iconTone: isDanger ? 'gold' : 'green',
      dotTone: isDanger ? 'danger' : 'warning',
    },
  };

  return addMatchingRegionalEvidence(localDecision, radar);
}
