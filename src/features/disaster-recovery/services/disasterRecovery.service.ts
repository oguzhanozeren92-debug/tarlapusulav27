import { supabase } from '../../../supabaseClient';
import { fetchFieldSatelliteFusion } from '../../satellite/services/satelliteFusion.service';
import type {
  SatelliteFusionSeriesPoint,
  SatelliteFusionResponse,
} from '../../satellite/types/satelliteFusion';

export type DisasterWeatherEventType =
  | 'frost'
  | 'extreme_heat'
  | 'heavy_rain'
  | 'severe_wind';

export type DisasterRecoveryStatus =
  | 'season_closed'
  | 'insufficient_evidence'
  | 'no_recent_event_candidate'
  | 'event_detected_waiting_satellite'
  | 'event_without_supported_damage'
  | 'damage_signal_supported'
  | 'recovering'
  | 'recovered';

export type DisasterRecoveryConfidence = 'low' | 'medium' | 'high';

export type DisasterWeatherDay = {
  date: string;
  temperature_min_c: number | null;
  temperature_max_c: number | null;
  precipitation_mm: number | null;
  wind_gust_kmh: number | null;
};

export type DisasterWeatherCandidate = {
  type: DisasterWeatherEventType;
  label: string;
  date: string;
  severity: number;
  weather: DisasterWeatherDay;
};

export type DisasterRecoveryResult = {
  fieldId: string;
  status: DisasterRecoveryStatus;
  confidence: DisasterRecoveryConfidence;
  headline: string;
  summary: string;
  action: string;
  event: null | {
    type: DisasterWeatherEventType;
    label: string;
    date: string;
    ageDays: number;
    severity: number;
    weather: DisasterWeatherDay;
  };
  damage: {
    supported: boolean;
    preEventNdvi: number | null;
    postEventNdvi: number | null;
    ndviDrop: number | null;
    ndviDropPercent: number | null;
    radarSupport: boolean;
    radarVhDropDb: number | null;
  };
  recovery: {
    status:
      | 'not_applicable'
      | 'waiting'
      | 'persistent_impact'
      | 'recovering'
      | 'recovered';
    latestNdvi: number | null;
    percentOfPreEvent: number | null;
  };
  evidence: string[];
  missingInputs: string[];
  weatherProvider: string | null;
  generatedAt: string;
  caution: string;
};

type DisasterWeatherHistoryResponse = {
  ok: true;
  field_id: string;
  mode: 'disaster_history';
  provider?: string;
  period?: { start_date?: string; end_date?: string };
  days?: DisasterWeatherDay[];
  candidates?: DisasterWeatherCandidate[];
  warnings?: string[];
  missing_inputs?: string[];
  generated_at?: string;
};

type DisasterWeatherErrorResponse = {
  ok?: false;
  error?: string;
};

const CACHE_TTL_MS = 30 * 60 * 1000;

const memoryCache = new Map<
  string,
  {
    expiresAt: number;
    value: DisasterRecoveryResult;
  }
>();

const inflight = new Map<string, Promise<DisasterRecoveryResult>>();

function median(values: number[]) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function windowMedian(
  series: SatelliteFusionSeriesPoint[],
  eventDate: string,
  fromDays: number,
  toDays: number,
) {
  const eventTs = Date.parse(`${eventDate}T00:00:00Z`);
  const values = series
    .filter((point) => {
      const ts = Date.parse(`${point.date}T00:00:00Z`);
      const day = Math.round((ts - eventTs) / 86_400_000);
      return day >= fromDays && day <= toDays;
    })
    .map((point) => point.mean)
    .filter(Number.isFinite);

  return {
    value: median(values),
    count: values.length,
  };
}

function eventAgeDays(date: string) {
  const eventTs = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(eventTs)) return 0;

  const today = new Date();
  const todayUtc = Date.parse(
    `${today.toISOString().slice(0, 10)}T00:00:00Z`,
  );
  return Math.max(0, Math.floor((todayUtc - eventTs) / 86_400_000));
}

function weatherEvidence(candidate: DisasterWeatherCandidate) {
  const day = candidate.weather;
  return [
    day.temperature_min_c !== null
      ? `Min sıcaklık ${day.temperature_min_c.toFixed(1)} °C`
      : null,
    day.temperature_max_c !== null
      ? `Maks sıcaklık ${day.temperature_max_c.toFixed(1)} °C`
      : null,
    day.precipitation_mm !== null
      ? `Yağış ${day.precipitation_mm.toFixed(1)} mm`
      : null,
    day.wind_gust_kmh !== null
      ? `Rüzgâr hamlesi ${day.wind_gust_kmh.toFixed(0)} km/sa`
      : null,
  ].filter((item): item is string => Boolean(item));
}

function emptyResult(
  fieldId: string,
  generatedAt: string,
  patch: Partial<DisasterRecoveryResult> = {},
): DisasterRecoveryResult {
  return {
    fieldId,
    status: 'insufficient_evidence',
    confidence: 'low',
    headline: 'Afet etkisi için yeterli kanıt yok',
    summary:
      'Tarla bazında yakın dönem hava olayı ile uydu değişimini birlikte değerlendirmek için yeterli veri oluşmadı.',
    action: 'Yeni hava ve uydu gözlemleri geldikçe takip otomatik güncellenecek.',
    event: null,
    damage: {
      supported: false,
      preEventNdvi: null,
      postEventNdvi: null,
      ndviDrop: null,
      ndviDropPercent: null,
      radarSupport: false,
      radarVhDropDb: null,
    },
    recovery: {
      status: 'not_applicable',
      latestNdvi: null,
      percentOfPreEvent: null,
    },
    evidence: [],
    missingInputs: [],
    weatherProvider: null,
    generatedAt,
    caution:
      'Bu sonuç resmî afet kaydı, sigorta/eksper hasar tespiti veya tek başına neden teşhisi değildir. Hava olayı adayı ile uydu değişiminin zamanlamasını birlikte gösterir.',
    ...patch,
  };
}

function assessDisasterRecovery(
  fieldId: string,
  fusion: SatelliteFusionResponse,
  weather: DisasterWeatherHistoryResponse,
): DisasterRecoveryResult {
  const generatedAt =
    String(weather.generated_at ?? fusion.generatedAt ?? '').trim() ||
    new Date().toISOString();
  const production = fusion.activeProduction;
  const ndviSeries = fusion.optical?.ndvi?.series ?? [];
  const vhSeries = fusion.radar?.vhDb?.series ?? [];
  const latestNdvi = ndviSeries.at(-1)?.mean ?? null;

  if (production?.status === 'season_closed' || production?.harvest_date) {
    return emptyResult(fieldId, generatedAt, {
      status: 'season_closed',
      confidence: 'high',
      headline: 'Sezon kapalı · afet hasarı takibi pasif',
      summary:
        'Kayıtlı hasat sonrası NDVI düşüşü afet hasarı olarak yorumlanmıyor.',
      action: 'Yeni sezon açıldığında afet etkisi takibi yeniden etkinleşir.',
      recovery: {
        status: 'not_applicable',
        latestNdvi,
        percentOfPreEvent: null,
      },
      weatherProvider: weather.provider ?? null,
    });
  }

  if (!production?.open_season) {
    return emptyResult(fieldId, generatedAt, {
      headline: 'Afet etkisi takibi için açık sezon kaydı gerekli',
      missingInputs: ['active_field_season'],
      weatherProvider: weather.provider ?? null,
      recovery: {
        status: 'not_applicable',
        latestNdvi,
        percentOfPreEvent: null,
      },
    });
  }

  if (ndviSeries.length < 4) {
    return emptyResult(fieldId, generatedAt, {
      missingInputs: ['recent_optical_samples'],
      weatherProvider: weather.provider ?? null,
      recovery: {
        status: 'waiting',
        latestNdvi,
        percentOfPreEvent: null,
      },
    });
  }

  const candidates = Array.isArray(weather.candidates)
    ? weather.candidates
    : [];

  if (!candidates.length) {
    return emptyResult(fieldId, generatedAt, {
      status: 'no_recent_event_candidate',
      confidence: 'medium',
      headline: 'Yakın dönemde güçlü hava olayı adayı yok',
      summary:
        'Mevcut hava geçmişinde don, aşırı sıcak, aşırı yağış veya şiddetli rüzgâr eşiğini aşan olay adayı görülmedi.',
      action: 'Takip otomatik sürüyor.',
      weatherProvider: weather.provider ?? null,
      recovery: {
        status: 'not_applicable',
        latestNdvi,
        percentOfPreEvent: null,
      },
    });
  }

  const assessed = candidates
    .map((event) => {
      const pre = windowMedian(ndviSeries, event.date, -30, -3);
      const post = windowMedian(ndviSeries, event.date, 3, 21);
      const preRadar = windowMedian(vhSeries, event.date, -30, -3);
      const postRadar = windowMedian(vhSeries, event.date, 3, 21);

      const drop =
        pre.value !== null && post.value !== null
          ? pre.value - post.value
          : null;
      const dropPct =
        drop !== null && pre.value !== null && pre.value > 0.05
          ? drop / pre.value
          : null;

      const radarDrop =
        preRadar.value !== null && postRadar.value !== null
          ? preRadar.value - postRadar.value
          : null;
      const radarSupport = radarDrop !== null && radarDrop >= 1;

      const damageSupported =
        pre.count >= 2 &&
        post.count >= 1 &&
        drop !== null &&
        drop >= 0.07 &&
        dropPct !== null &&
        dropPct >= 0.12;

      const score =
        Number(event.severity ?? 0) * 0.45 +
        (damageSupported
          ? Math.min(0.55, Math.max(0, (dropPct ?? 0) * 1.8))
          : 0);

      return {
        event,
        pre,
        post,
        drop,
        dropPct,
        radarDrop,
        radarSupport,
        damageSupported,
        score,
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.event.date.localeCompare(a.event.date),
    );

  const best = assessed[0];
  const event = best.event;
  const ageDays = eventAgeDays(event.date);
  const eventEvidence = weatherEvidence(event);

  if (!best.damageSupported) {
    if (ageDays <= 14 && best.post.count === 0) {
      return emptyResult(fieldId, generatedAt, {
        status: 'event_detected_waiting_satellite',
        confidence: 'low',
        headline: `${event.label} · uydu doğrulaması bekleniyor`,
        summary:
          'Güçlü hava olayı adayı kaydedildi ancak olay sonrası yeterli bulutsuz uydu gözlemi henüz oluşmadı.',
        action:
          'Yeni Sentinel-2 gözlemi geldiğinde etki otomatik karşılaştırılacak.',
        event: {
          type: event.type,
          label: event.label,
          date: event.date,
          ageDays,
          severity: Number(event.severity ?? 0),
          weather: event.weather,
        },
        recovery: {
          status: 'waiting',
          latestNdvi,
          percentOfPreEvent: null,
        },
        evidence: eventEvidence,
        missingInputs: ['post_event_optical_sample'],
        weatherProvider: weather.provider ?? null,
      });
    }

    return emptyResult(fieldId, generatedAt, {
      status: 'event_without_supported_damage',
      confidence:
        best.pre.count >= 2 && best.post.count >= 1 ? 'medium' : 'low',
      headline: `${event.label} · belirgin uydu hasar sinyali yok`,
      summary:
        'Yakın dönemde güçlü hava olayı adayı var; ancak olay sonrasında NDVI düşüşü afet etkisini destekleyecek büyüklükte değil.',
      action: 'Saha gözlemi varsa kaydet; uydu takibi otomatik devam edecek.',
      event: {
        type: event.type,
        label: event.label,
        date: event.date,
        ageDays,
        severity: Number(event.severity ?? 0),
        weather: event.weather,
      },
      damage: {
        supported: false,
        preEventNdvi: best.pre.value,
        postEventNdvi: best.post.value,
        ndviDrop: best.drop === null ? null : Number(best.drop.toFixed(4)),
        ndviDropPercent:
          best.dropPct === null
            ? null
            : Number((best.dropPct * 100).toFixed(1)),
        radarSupport: best.radarSupport,
        radarVhDropDb:
          best.radarDrop === null
            ? null
            : Number(best.radarDrop.toFixed(2)),
      },
      recovery: {
        status: 'not_applicable',
        latestNdvi,
        percentOfPreEvent: null,
      },
      evidence: [
        ...eventEvidence,
        best.pre.value !== null
          ? `Olay öncesi NDVI medyanı ${best.pre.value.toFixed(2)}`
          : '',
        best.post.value !== null
          ? `Olay sonrası NDVI medyanı ${best.post.value.toFixed(2)}`
          : '',
      ].filter(Boolean),
      weatherProvider: weather.provider ?? null,
    });
  }

  const recoveryRatio =
    latestNdvi !== null &&
    best.pre.value !== null &&
    best.pre.value > 0.05
      ? latestNdvi / best.pre.value
      : null;

  const recoveryStatus =
    recoveryRatio === null
      ? 'waiting'
      : recoveryRatio >= 0.9
        ? 'recovered'
        : recoveryRatio >= 0.75
          ? 'recovering'
          : 'persistent_impact';

  const status: DisasterRecoveryStatus =
    recoveryStatus === 'recovered'
      ? 'recovered'
      : recoveryStatus === 'recovering'
        ? 'recovering'
        : 'damage_signal_supported';

  const headline =
    recoveryStatus === 'recovered'
      ? `${event.label} sonrası toparlanma güçlü`
      : recoveryStatus === 'recovering'
        ? `${event.label} sonrası toparlanma sürüyor`
        : `${event.label} sonrası hasar sinyali destekleniyor`;

  const summary =
    recoveryStatus === 'recovered'
      ? 'Olay sonrası düşüşten sonra güncel NDVI, olay öncesi bitki örtüsü seviyesinin yaklaşık %90 veya üzerine döndü.'
      : recoveryStatus === 'recovering'
        ? 'Olay sonrası NDVI düşüşü görüldü; son gözlem olay öncesi seviyeye doğru toparlanma gösteriyor.'
        : 'Güçlü hava olayı adayı sonrasında NDVI belirgin düştü ve güncel bitki örtüsü sinyali henüz olay öncesi seviyeye dönmedi.';

  const action =
    recoveryStatus === 'recovered'
      ? 'Saha kaydıyla toparlanmayı doğrula; rutin izlemeye dön.'
      : 'Etkilenen alanı sahada kontrol et ve mümkünse fotoğraf ekle. Pusula sonraki uydu gözlemlerinde toparlanmayı izlemeye devam edecek.';

  const confidence: DisasterRecoveryConfidence =
    best.radarSupport && best.pre.count >= 2 && best.post.count >= 2
      ? 'high'
      : 'medium';

  return {
    fieldId,
    status,
    confidence,
    headline,
    summary,
    action,
    event: {
      type: event.type,
      label: event.label,
      date: event.date,
      ageDays,
      severity: Number(event.severity ?? 0),
      weather: event.weather,
    },
    damage: {
      supported: true,
      preEventNdvi: best.pre.value,
      postEventNdvi: best.post.value,
      ndviDrop: best.drop === null ? null : Number(best.drop.toFixed(4)),
      ndviDropPercent:
        best.dropPct === null
          ? null
          : Number((best.dropPct * 100).toFixed(1)),
      radarSupport: best.radarSupport,
      radarVhDropDb:
        best.radarDrop === null
          ? null
          : Number(best.radarDrop.toFixed(2)),
    },
    recovery: {
      status: recoveryStatus,
      latestNdvi,
      percentOfPreEvent:
        recoveryRatio === null
          ? null
          : Number((recoveryRatio * 100).toFixed(1)),
    },
    evidence: [
      ...eventEvidence,
      best.pre.value !== null
        ? `Olay öncesi NDVI medyanı ${best.pre.value.toFixed(2)}`
        : '',
      best.post.value !== null
        ? `Olay sonrası NDVI medyanı ${best.post.value.toFixed(2)}`
        : '',
      best.radarSupport
        ? 'Sentinel-1 VH değişimi optik düşüşü destekliyor'
        : '',
    ].filter(Boolean),
    missingInputs: [],
    weatherProvider: weather.provider ?? null,
    generatedAt,
    caution:
      'Bu sonuç resmî afet kaydı, sigorta/eksper hasar tespiti veya tek başına neden teşhisi değildir. Hava olayı adayı ile uydu değişiminin zamanlamasını birlikte gösterir.',
  };
}

async function fetchWeatherHistory(
  fieldId: string,
): Promise<DisasterWeatherHistoryResponse> {
  const { data, error } = await supabase.functions.invoke<
    DisasterWeatherHistoryResponse | DisasterWeatherErrorResponse
  >('field-risk-weather', {
    body: {
      field_id: fieldId,
      mode: 'disaster_history',
    },
  });

  if (error) {
    throw new Error(`Afet hava geçmişi alınamadı: ${error.message}`);
  }

  if (!data || data.ok !== true) {
    throw new Error(
      (data as DisasterWeatherErrorResponse | null)?.error ??
        'Afet hava geçmişi alınamadı.',
    );
  }

  return data as DisasterWeatherHistoryResponse;
}

export async function fetchDisasterRecovery(
  fieldId: string | number,
  force = false,
): Promise<DisasterRecoveryResult> {
  const key = String(fieldId ?? '').trim();
  if (!key) throw new Error('Afet/iyileşme takibi için tarla kimliği gerekli.');

  const cached = memoryCache.get(key);
  if (!force && cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const running = inflight.get(key);
  if (!force && running) return running;

  const request = (async () => {
    const [fusion, weather] = await Promise.all([
      fetchFieldSatelliteFusion(key, force),
      fetchWeatherHistory(key),
    ]);

    const result = assessDisasterRecovery(key, fusion, weather);
    memoryCache.set(key, {
      value: result,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return result;
  })();

  inflight.set(key, request);
  try {
    return await request;
  } finally {
    inflight.delete(key);
  }
}

export function clearDisasterRecoveryCache(
  fieldId?: string | number | null,
) {
  const key = String(fieldId ?? '').trim();
  if (key) {
    memoryCache.delete(key);
    return;
  }
  memoryCache.clear();
}
