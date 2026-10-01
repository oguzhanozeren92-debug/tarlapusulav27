import type {
  BiophysicalSnapshot,
  ScientificMetric,
} from './fieldScientificSignals.service';

export type BiophysicalMetricKey =
  | 'LAI'
  | 'CCC'
  | 'CWC'
  | 'fCOVER'
  | 'fAPAR'
  | 'Albedo';

export type BiophysicalTrendDirection =
  | 'up'
  | 'down'
  | 'stable'
  | 'unknown';

export type BiophysicalMetricTrend = {
  key: BiophysicalMetricKey;
  current: number | null;
  previous: number | null;
  absoluteChange: number | null;
  relativeChangePercent: number | null;
  direction: BiophysicalTrendDirection;
  significant: boolean;
  shortLabel: string;
};

export type BiophysicalTaskCandidate = {
  active: boolean;
  sceneId: string | null;
  acquiredAt: string | null;
  title: string;
  description: string;
  priority: number;
  rewardPoints: number;
  sourceLayer: 'vegetation';
  openPhoto: boolean;
  reasonCodes: string[];
};

export type FieldBiophysicsInsight = {
  headline: string;
  summary: string;
  confidenceLabel: string;
  quality: 'high' | 'medium' | 'low' | 'unknown';
  comparisonReady: boolean;
  comparisonLabel: string;
  expectedSeasonalDecline: boolean;
  monitoringScore: number | null;
  monitoringLabel: string;
  trends: Record<BiophysicalMetricKey, BiophysicalMetricTrend>;
  topChanges: string[];
  irrigationCanopyCoverPercent: number | null;
  irrigationCanopyCoverSource: 'sl2p' | null;
  taskCandidate: BiophysicalTaskCandidate;
};

const METRIC_LABELS: Record<BiophysicalMetricKey, string> = {
  LAI: 'Yaprak alanı',
  CCC: 'Klorofil',
  CWC: 'Bitki suyu',
  fCOVER: 'Bitki örtüsü',
  fAPAR: 'Işık kullanımı',
  Albedo: 'Yansıtım',
};

const KEYS: BiophysicalMetricKey[] = [
  'LAI',
  'CCC',
  'CWC',
  'fCOVER',
  'fAPAR',
  'Albedo',
];

function finite(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function metricValue(metric: ScientificMetric | undefined) {
  return finite(metric?.value ?? metric?.mean);
}

function normalizedQuality(value: unknown): FieldBiophysicsInsight['quality'] {
  const text = String(value ?? '').trim().toLocaleLowerCase('tr-TR');
  if (text === 'high' || text === 'yüksek' || text === 'yuksek') return 'high';
  if (text === 'medium' || text === 'orta') return 'medium';
  if (text === 'low' || text === 'düşük' || text === 'dusuk') return 'low';
  return 'unknown';
}

function expectedDeclineStage(stageLabel: unknown) {
  const text = String(stageLabel ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR');

  return /(hasat|olgun|senes|dinlen|dorm|yaprak dök|yaprak dok|sezon sonu)/i.test(text);
}

function relativeChangePercent(current: number, previous: number) {
  if (Math.abs(previous) < 1e-9) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function fractionDirection(current: number, previous: number) {
  const change = current - previous;
  if (Math.abs(change) < 0.04) return 'stable' as const;
  return change > 0 ? ('up' as const) : ('down' as const);
}

function relativeDirection(current: number, previous: number) {
  const change = relativeChangePercent(current, previous);
  if (change === null || Math.abs(change) < 10) return 'stable' as const;
  return change > 0 ? ('up' as const) : ('down' as const);
}

function isSignificant(
  key: BiophysicalMetricKey,
  current: number,
  previous: number,
  direction: BiophysicalTrendDirection,
) {
  if (direction === 'stable' || direction === 'unknown') return false;

  if (key === 'fCOVER' || key === 'fAPAR') {
    return Math.abs(current - previous) >= 0.08;
  }

  if (key === 'Albedo') {
    return Math.abs(current - previous) >= 0.04;
  }

  const relative = relativeChangePercent(current, previous);
  if (relative === null) return false;

  if (key === 'CWC') return Math.abs(relative) >= 20;
  return Math.abs(relative) >= 15;
}

function shortTrendLabel(
  key: BiophysicalMetricKey,
  current: number | null,
  previous: number | null,
  direction: BiophysicalTrendDirection,
) {
  if (current === null || previous === null || direction === 'unknown') return 'İlk ölçüm';
  if (direction === 'stable') return '≈ Sabit';

  if (key === 'fCOVER' || key === 'fAPAR') {
    const pointChange = Math.round((current - previous) * 100);
    return `${direction === 'up' ? '↑' : '↓'} ${Math.abs(pointChange)} puan`;
  }

  const relative = relativeChangePercent(current, previous);
  if (relative === null) return direction === 'up' ? '↑ Artıyor' : '↓ Azalıyor';
  return `${direction === 'up' ? '↑' : '↓'} %${Math.round(Math.abs(relative))}`;
}

function buildTrend(
  key: BiophysicalMetricKey,
  latest: BiophysicalSnapshot,
  previous: BiophysicalSnapshot | null,
): BiophysicalMetricTrend {
  const current = metricValue(latest.metrics?.[key]);
  const previousValue = previous ? metricValue(previous.metrics?.[key]) : null;

  if (current === null || previousValue === null) {
    return {
      key,
      current,
      previous: previousValue,
      absoluteChange: null,
      relativeChangePercent: null,
      direction: 'unknown',
      significant: false,
      shortLabel: 'İlk ölçüm',
    };
  }

  const direction =
    key === 'fCOVER' || key === 'fAPAR' || key === 'Albedo'
      ? fractionDirection(current, previousValue)
      : relativeDirection(current, previousValue);

  return {
    key,
    current,
    previous: previousValue,
    absoluteChange: current - previousValue,
    relativeChangePercent: relativeChangePercent(current, previousValue),
    direction,
    significant: isSignificant(key, current, previousValue, direction),
    shortLabel: shortTrendLabel(key, current, previousValue, direction),
  };
}

function qualityLabel(quality: FieldBiophysicsInsight['quality']) {
  if (quality === 'high') return 'Yüksek güven';
  if (quality === 'medium') return 'Orta güven';
  if (quality === 'low') return 'Düşük güven';
  return 'Güven bilgisi yok';
}

function buildTopChanges(trends: Record<BiophysicalMetricKey, BiophysicalMetricTrend>) {
  const priority: BiophysicalMetricKey[] = ['LAI', 'fCOVER', 'CCC', 'CWC', 'fAPAR'];

  return priority
    .map((key) => trends[key])
    .filter((item) => item.current !== null && item.previous !== null)
    .sort((a, b) => {
      if (a.significant !== b.significant) return a.significant ? -1 : 1;
      const aa = Math.abs(a.relativeChangePercent ?? (a.absoluteChange ?? 0) * 100);
      const bb = Math.abs(b.relativeChangePercent ?? (b.absoluteChange ?? 0) * 100);
      return bb - aa;
    })
    .slice(0, 3)
    .map((item) => `${METRIC_LABELS[item.key]} ${item.shortLabel}`);
}

function monitoringScore(
  quality: FieldBiophysicsInsight['quality'],
  expectedDecline: boolean,
  trends: Record<BiophysicalMetricKey, BiophysicalMetricTrend>,
) {
  if (quality === 'low' || quality === 'unknown') return null;

  const comparable = KEYS.filter((key) => trends[key].previous !== null);
  if (!comparable.length) return null;

  let score = 76;
  const weighted: Array<[BiophysicalMetricKey, number]> = [
    ['LAI', 10],
    ['fCOVER', 10],
    ['CCC', 8],
    ['CWC', 7],
    ['fAPAR', 7],
  ];

  weighted.forEach(([key, weight]) => {
    const trend = trends[key];
    if (!trend.significant) {
      if (trend.direction === 'stable') score += 1;
      return;
    }

    if (trend.direction === 'up') score += Math.round(weight * 0.35);
    if (trend.direction === 'down') score -= expectedDecline ? 1 : weight;
  });

  return Math.max(30, Math.min(95, Math.round(score)));
}

function monitoringLabel(score: number | null, expectedDecline: boolean) {
  if (score === null) return 'Trend için daha fazla veri gerekli';
  if (expectedDecline) return 'Sezon sonu değişimi izleniyor';
  if (score >= 78) return 'Gidişat dengeli';
  if (score >= 60) return 'Yakından izlenmeli';
  return 'Saha kontrolü önerilir';
}

function buildTaskCandidate(
  latest: BiophysicalSnapshot,
  quality: FieldBiophysicsInsight['quality'],
  expectedDecline: boolean,
  trends: Record<BiophysicalMetricKey, BiophysicalMetricTrend>,
): BiophysicalTaskCandidate {
  const declining = (['LAI', 'fCOVER', 'CCC', 'CWC'] as BiophysicalMetricKey[])
    .filter((key) => trends[key].direction === 'down' && trends[key].significant);

  const active =
    !expectedDecline &&
    quality !== 'low' &&
    quality !== 'unknown' &&
    declining.length >= 2;

  const detail = declining
    .slice(0, 3)
    .map((key) => `${METRIC_LABELS[key]} ${trends[key].shortLabel}`)
    .join(' · ');

  return {
    active,
    sceneId: latest.sceneId || null,
    acquiredAt: latest.acquiredAt || null,
    title: 'Bitki Gidişatını Sahada Kontrol Et',
    description: active
      ? `Uydu ölçümünde birden fazla bitki göstergesi birlikte geriledi: ${detail}. Şüpheli alanı sahada ve mümkünse fotoğrafla doğrula.`
      : '',
    priority: 84,
    rewardPoints: 30,
    sourceLayer: 'vegetation',
    openPhoto: true,
    reasonCodes: declining.map((key) => `decline:${key.toLowerCase()}`),
  };
}

export function buildFieldBiophysicsInsight(input: {
  history: BiophysicalSnapshot[];
  cropName?: unknown;
  stageLabel?: unknown;
}): FieldBiophysicsInsight {
  const history = Array.isArray(input.history) ? input.history : [];
  const latest = history[0] ?? null;

  const emptyTrends = Object.fromEntries(
    KEYS.map((key) => [
      key,
      {
        key,
        current: null,
        previous: null,
        absoluteChange: null,
        relativeChangePercent: null,
        direction: 'unknown',
        significant: false,
        shortLabel: 'İlk ölçüm',
      } satisfies BiophysicalMetricTrend,
    ]),
  ) as Record<BiophysicalMetricKey, BiophysicalMetricTrend>;

  if (!latest) {
    return {
      headline: 'Uydu bitki ölçümü henüz oluşmadı',
      summary: 'İlk uygun Sentinel-2 görüntüsü geldiğinde yaprak alanı, örtü, klorofil ve bitki suyu birlikte izlenecek.',
      confidenceLabel: 'Veri bekleniyor',
      quality: 'unknown',
      comparisonReady: false,
      comparisonLabel: 'Karşılaştırma için ilk ölçüm bekleniyor',
      expectedSeasonalDecline: false,
      monitoringScore: null,
      monitoringLabel: 'Trend için daha fazla veri gerekli',
      trends: emptyTrends,
      topChanges: [],
      irrigationCanopyCoverPercent: null,
      irrigationCanopyCoverSource: null,
      taskCandidate: {
        active: false,
        sceneId: null,
        acquiredAt: null,
        title: 'Bitki Gidişatını Sahada Kontrol Et',
        description: '',
        priority: 84,
        rewardPoints: 30,
        sourceLayer: 'vegetation',
        openPhoto: true,
        reasonCodes: [],
      },
    };
  }

  const previous = history.find((item, index) => index > 0 && item.sceneId !== latest.sceneId) ?? null;
  const quality = normalizedQuality(latest.qc?.quality);
  const previousQuality = previous ? normalizedQuality(previous.qc?.quality) : 'unknown';
  const expectedDecline = expectedDeclineStage(input.stageLabel);

  const trends = Object.fromEntries(
    KEYS.map((key) => [key, buildTrend(key, latest, previous)]),
  ) as Record<BiophysicalMetricKey, BiophysicalMetricTrend>;

  const comparable = Boolean(previous);
  const significantDown = KEYS.filter(
    (key) => trends[key].significant && trends[key].direction === 'down',
  );
  const significantUp = KEYS.filter(
    (key) => trends[key].significant && trends[key].direction === 'up',
  );

  let headline = 'İlk uydu bitki ölçümü hazır';
  let summary = 'Bu ölçümü tek başına iyi veya kötü diye sınıflandırmıyorum. Sonraki uydu tarihleri geldikçe tarlanın kendi geçmişiyle karşılaştıracağım.';

  if (quality === 'low') {
    headline = 'Ölçüm var, ancak görüntü kalitesi düşük';
    summary = 'Bu tarihteki değerleri destek sinyali olarak kullanıyorum; düşük veri kalitesinden dolayı tek başına görev veya sulama kararı üretmiyorum.';
  } else if (previous && previousQuality === 'low') {
    headline = 'Yeni ölçüm hazır';
    summary = 'Önceki görüntünün kalitesi düşük olduğu için değişim yüzdelerini temkinli yorumluyorum. Bir sonraki kaliteli görüntü trendi daha netleştirecek.';
  } else if (previous && expectedDecline && significantDown.length) {
    headline = 'Sezon sonu düşüşü izleniyor';
    summary = 'Yaprak alanı veya bitki örtüsünde gerileme var; mevcut gelişim dönemi olgunlaşma/hasat tarafında olduğu için bunun mevsimsel olması mümkün. Ani sapma olup olmadığını sonraki görüntüyle karşılaştıracağım.';
  } else if (previous && significantDown.length >= 2) {
    headline = 'Birden fazla bitki göstergesi geriliyor';
    summary = 'Yaprak alanı, örtü, klorofil veya bitki suyu göstergelerinden en az ikisi birlikte düştü. Uydu sinyalini saha gözlemiyle doğrulamak daha güvenli olur.';
  } else if (previous && significantUp.length >= 2) {
    headline = 'Bitki göstergelerinde güçlenme var';
    summary = 'Birden fazla bitki göstergesi önceki uydu tarihine göre yükseldi. Bu değişimi tarlanın gelişim dönemi ve saha gözlemleriyle birlikte izliyorum.';
  } else if (previous) {
    headline = 'Bitki göstergeleri büyük ölçüde dengeli';
    summary = 'Önceki uydu tarihine göre belirgin ve birlikte hareket eden keskin bir değişim görünmüyor. Trend izlenmeye devam edecek.';
  }

  const cover = metricValue(latest.metrics?.fCOVER);
  const validCover =
    cover !== null &&
    cover >= 0 &&
    cover <= 1 &&
    quality !== 'low' &&
    quality !== 'unknown';

  const trendQuality = previous && previousQuality === 'low' ? 'low' : quality;
  const score = monitoringScore(trendQuality, expectedDecline, trends);

  return {
    headline,
    summary,
    confidenceLabel: qualityLabel(quality),
    quality,
    comparisonReady: comparable,
    comparisonLabel: previous
      ? `Önceki uydu tarihi: ${new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(previous.acquiredAt))}`
      : 'Bu tarladaki ilk biyofizik ölçüm',
    expectedSeasonalDecline: expectedDecline,
    monitoringScore: score,
    monitoringLabel: monitoringLabel(score, expectedDecline),
    trends,
    topChanges: buildTopChanges(trends),
    irrigationCanopyCoverPercent: validCover ? Math.round(cover * 100) : null,
    irrigationCanopyCoverSource: validCover ? 'sl2p' : null,
    taskCandidate: buildTaskCandidate(latest, trendQuality, expectedDecline, trends),
  };
}
