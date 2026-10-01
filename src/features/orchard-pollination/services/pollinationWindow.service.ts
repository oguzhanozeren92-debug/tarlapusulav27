import type {
  PollinationDay,
  PollinationEvaluatedHour,
  PollinationForecastHour,
  PollinationHourStatus,
  PollinationMode,
  PollinationWindow,
  PollinationWindowSnapshot,
} from '../types/pollinationWindow';

const FORECAST_DAYS = 5;
const HOUR_MS = 60 * 60 * 1000;

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalize(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9çğıöşü]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function resolvePollinationMode(cropInput: unknown): PollinationMode {
  const crop = normalize(cropInput);
  if (!crop) return 'unsupported';

  const insectAliases = [
    'badem', 'almond', 'elma', 'apple', 'armut', 'pear', 'kiraz', 'cherry',
    'visne', 'sour cherry', 'seftali', 'peach', 'kayisi', 'apricot', 'erik', 'plum',
  ];
  if (insectAliases.some((alias) => crop.includes(alias))) return 'insect';

  const windAliases = [
    'antep fistigi', 'antepfistigi', 'pistachio', 'ceviz', 'walnut', 'findik', 'hazelnut',
  ];
  if (windAliases.some((alias) => crop.includes(alias))) return 'wind';

  return 'unsupported';
}

export function pollinationModeLabel(mode: PollinationMode) {
  if (mode === 'insect') return 'Böcek / arı ile tozlaşma';
  if (mode === 'wind') return 'Rüzgârla tozlaşma';
  return 'Desteklenmeyen ürün';
}

function scoreInsectHour(hour: PollinationForecastHour): PollinationEvaluatedHour {
  let score = 100;
  const reasons: Array<{ weight: number; text: string }> = [];

  if (hour.isDay !== true) {
    score -= 80;
    reasons.push({ weight: 80, text: 'Gündüz saati değil' });
  }

  if (hour.temperatureC === null) {
    score -= 45;
    reasons.push({ weight: 45, text: 'Sıcaklık verisi eksik' });
  } else if (hour.temperatureC < 10) {
    score -= 55;
    reasons.push({ weight: 55, text: `Sıcaklık ${Math.round(hour.temperatureC)}°C` });
  } else if (hour.temperatureC < 15) {
    score -= 25;
    reasons.push({ weight: 25, text: `Serin hava ${Math.round(hour.temperatureC)}°C` });
  } else if (hour.temperatureC > 30) {
    score -= 40;
    reasons.push({ weight: 40, text: `Sıcaklık ${Math.round(hour.temperatureC)}°C` });
  } else if (hour.temperatureC > 27) {
    score -= 15;
    reasons.push({ weight: 15, text: `Sıcak hava ${Math.round(hour.temperatureC)}°C` });
  }

  if (hour.rainMm === null || hour.rainChance === null) {
    score -= 25;
    reasons.push({ weight: 25, text: 'Yağış verisi eksik' });
  } else if (hour.rainMm >= 0.2 || hour.rainChance >= 60) {
    score -= 65;
    reasons.push({
      weight: 65,
      text: hour.rainMm >= 0.2
        ? `Yağış ${hour.rainMm.toFixed(1)} mm`
        : `Yağış olasılığı %${Math.round(hour.rainChance)}`,
    });
  } else if (hour.rainChance >= 30) {
    score -= 20;
    reasons.push({ weight: 20, text: `Yağış olasılığı %${Math.round(hour.rainChance)}` });
  }

  if (hour.windKmh === null || hour.gustKmh === null) {
    score -= 20;
    reasons.push({ weight: 20, text: 'Rüzgâr verisi eksik' });
  } else if (hour.windKmh > 24 || hour.gustKmh > 35) {
    score -= 55;
    reasons.push({ weight: 55, text: `Rüzgâr ${Math.round(hour.windKmh)} km/sa` });
  } else if (hour.windKmh > 16 || hour.gustKmh > 25) {
    score -= 20;
    reasons.push({ weight: 20, text: `Rüzgâr ${Math.round(hour.windKmh)} km/sa` });
  }

  const bounded = Math.max(0, Math.min(100, Math.round(score)));
  const status: PollinationHourStatus = bounded >= 70 ? 'good' : bounded >= 45 ? 'watch' : 'poor';
  const limitingFactor = reasons.sort((a, b) => b.weight - a.weight)[0]?.text ?? null;
  return { ...hour, score: bounded, status, limitingFactor };
}

function scoreWindHour(hour: PollinationForecastHour): PollinationEvaluatedHour {
  let score = 100;
  const reasons: Array<{ weight: number; text: string }> = [];

  if (hour.isDay !== true) {
    score -= 35;
    reasons.push({ weight: 35, text: 'Gündüz saati değil' });
  }

  if (hour.temperatureC === null) {
    score -= 30;
    reasons.push({ weight: 30, text: 'Sıcaklık verisi eksik' });
  } else if (hour.temperatureC < 10 || hour.temperatureC > 32) {
    score -= 40;
    reasons.push({ weight: 40, text: `Sıcaklık ${Math.round(hour.temperatureC)}°C` });
  } else if (hour.temperatureC < 14 || hour.temperatureC > 28) {
    score -= 15;
    reasons.push({ weight: 15, text: `Sıcaklık ${Math.round(hour.temperatureC)}°C` });
  }

  if (hour.rainMm === null || hour.rainChance === null) {
    score -= 25;
    reasons.push({ weight: 25, text: 'Yağış verisi eksik' });
  } else if (hour.rainMm >= 0.2 || hour.rainChance >= 60) {
    score -= 65;
    reasons.push({
      weight: 65,
      text: hour.rainMm >= 0.2
        ? `Yağış ${hour.rainMm.toFixed(1)} mm`
        : `Yağış olasılığı %${Math.round(hour.rainChance)}`,
    });
  } else if (hour.rainChance >= 30) {
    score -= 20;
    reasons.push({ weight: 20, text: `Yağış olasılığı %${Math.round(hour.rainChance)}` });
  }

  if (hour.windKmh === null || hour.gustKmh === null) {
    score -= 25;
    reasons.push({ weight: 25, text: 'Rüzgâr verisi eksik' });
  } else if (hour.windKmh < 4) {
    score -= 30;
    reasons.push({ weight: 30, text: `Rüzgâr çok hafif (${Math.round(hour.windKmh)} km/sa)` });
  } else if (hour.windKmh > 28 || hour.gustKmh > 40) {
    score -= 45;
    reasons.push({ weight: 45, text: `Rüzgâr çok kuvvetli (${Math.round(hour.windKmh)} km/sa)` });
  } else if (hour.windKmh > 22 || hour.gustKmh > 34) {
    score -= 20;
    reasons.push({ weight: 20, text: `Kuvvetli rüzgâr ${Math.round(hour.windKmh)} km/sa` });
  }

  const bounded = Math.max(0, Math.min(100, Math.round(score)));
  const status: PollinationHourStatus = bounded >= 70 ? 'good' : bounded >= 45 ? 'watch' : 'poor';
  const limitingFactor = reasons.sort((a, b) => b.weight - a.weight)[0]?.text ?? null;
  return { ...hour, score: bounded, status, limitingFactor };
}

export function evaluatePollinationHour(
  hour: PollinationForecastHour,
  mode: PollinationMode,
): PollinationEvaluatedHour {
  if (mode === 'wind') return scoreWindHour(hour);
  return scoreInsectHour(hour);
}

function localDay(time: number, timezone: string) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(time);
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(time);
  }
}

export function formatPollinationHour(time: number, timezone: string) {
  try {
    return new Intl.DateTimeFormat('tr-TR', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(time);
  } catch {
    return new Intl.DateTimeFormat('tr-TR', {
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(time);
  }
}

function buildWindows(hours: PollinationEvaluatedHour[]): PollinationWindow[] {
  const usable = hours.filter((hour) => hour.status !== 'poor');
  const windows: PollinationWindow[] = [];

  for (const hour of usable) {
    const previous = windows[windows.length - 1];
    if (previous && previous.to === hour.time && previous.status === hour.status) {
      const previousHours = Math.max(1, (previous.to - previous.from) / HOUR_MS);
      previous.to = hour.time + HOUR_MS;
      previous.averageScore = Math.round(
        (previous.averageScore * previousHours + hour.score) / (previousHours + 1),
      );
      if (!previous.limitingFactor && hour.limitingFactor) previous.limitingFactor = hour.limitingFactor;
      continue;
    }

    windows.push({
      from: hour.time,
      to: hour.time + HOUR_MS,
      status: hour.status,
      averageScore: hour.score,
      limitingFactor: hour.limitingFactor,
    });
  }

  return windows.filter((window) => window.to - window.from >= 2 * HOUR_MS);
}

function bestDay(
  date: string,
  hours: PollinationEvaluatedHour[],
  windows: PollinationWindow[],
  timezone: string,
): PollinationDay {
  const dayHours = hours.filter((hour) => localDay(hour.time, timezone) === date && hour.isDay === true);
  const dayWindows = windows.filter((window) => localDay(window.from, timezone) === date);
  const bestWindow = [...dayWindows].sort((a, b) => b.averageScore - a.averageScore)[0] ?? null;
  const bestHour = [...dayHours].sort((a, b) => b.score - a.score)[0] ?? null;
  const bestScore = bestWindow?.averageScore ?? bestHour?.score ?? 0;
  const bestStatus: PollinationDay['bestStatus'] = bestScore >= 70 ? 'good' : bestScore >= 45 ? 'watch' : 'poor';
  const limitingFactor =
    bestWindow?.limitingFactor ??
    dayHours.filter((hour) => hour.limitingFactor).sort((a, b) => a.score - b.score)[0]?.limitingFactor ??
    null;

  return { date, bestStatus, bestScore, bestWindow, limitingFactor };
}

async function fetchForecast(latitude: number, longitude: number) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(latitude));
  url.searchParams.set('longitude', String(longitude));
  url.searchParams.set(
    'hourly',
    'temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,wind_speed_10m,wind_gusts_10m,is_day',
  );
  url.searchParams.set('wind_speed_unit', 'kmh');
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('timeformat', 'unixtime');
  url.searchParams.set('forecast_days', String(FORECAST_DAYS));

  const response = await fetch(url.toString());
  if (!response.ok) throw new Error('Tozlaşma için saatlik hava tahmini alınamadı.');
  const payload = await response.json();
  const hourly = payload?.hourly;
  if (!Array.isArray(hourly?.time) || hourly.time.length === 0) {
    throw new Error('Tozlaşma için saatlik tahmin bulunamadı.');
  }

  const hours: PollinationForecastHour[] = hourly.time
    .map((timestamp: unknown, index: number) => ({
      time: Number(timestamp) * 1000,
      temperatureC: finite(hourly.temperature_2m?.[index]),
      humidity: finite(hourly.relative_humidity_2m?.[index]),
      rainChance: finite(hourly.precipitation_probability?.[index]),
      rainMm: finite(hourly.precipitation?.[index]),
      windKmh: finite(hourly.wind_speed_10m?.[index]),
      gustKmh: finite(hourly.wind_gusts_10m?.[index]),
      isDay: hourly.is_day?.[index] === 1 ? true : hourly.is_day?.[index] === 0 ? false : null,
    }))
    .filter((hour: PollinationForecastHour) => Number.isFinite(hour.time));

  return {
    timezone: String(payload?.timezone || 'Europe/Istanbul'),
    updatedAt: Date.now(),
    hours,
  };
}

export async function loadPollinationWindow(input: {
  fieldId: string;
  crop: string;
  latitude: number;
  longitude: number;
  floweringTreeCount?: number;
}): Promise<PollinationWindowSnapshot> {
  const mode = resolvePollinationMode(input.crop);
  if (mode === 'unsupported') {
    return {
      version: 'pollination-v1',
      fieldId: input.fieldId,
      crop: input.crop,
      mode,
      modeLabel: pollinationModeLabel(mode),
      floweringTreeCount: input.floweringTreeCount ?? 0,
      floweringEvidence: (input.floweringTreeCount ?? 0) > 0 ? 'confirmed' : 'not_recorded',
      timezone: 'Europe/Istanbul',
      generatedAt: new Date().toISOString(),
      updatedAt: Date.now(),
      today: null,
      days: [],
      windows: [],
      evidence: [],
      warnings: ['Bu ürün için tozlaşma hava profili henüz doğrulanmadı; genel eşik uygulanmaz.'],
    };
  }

  const forecast = await fetchForecast(input.latitude, input.longitude);
  const now = Date.now();
  const evaluated = forecast.hours
    .filter((hour) => hour.time >= now - HOUR_MS)
    .map((hour) => evaluatePollinationHour(hour, mode));
  const windows = buildWindows(evaluated);
  const dates = [...new Set(evaluated.map((hour) => localDay(hour.time, forecast.timezone)))];
  const days = dates.slice(0, FORECAST_DAYS).map((date) => bestDay(date, evaluated, windows, forecast.timezone));
  const todayKey = localDay(now, forecast.timezone);
  const today = days.find((day) => day.date === todayKey) ?? days[0] ?? null;
  const floweringTreeCount = Math.max(0, Math.round(input.floweringTreeCount ?? 0));

  const evidence = [
    `Tozlaşma tipi: ${pollinationModeLabel(mode)}.`,
    `${FORECAST_DAYS} günlük saatlik sıcaklık, yağış ve rüzgâr tahmini tarla koordinatında tarandı.`,
    floweringTreeCount > 0
      ? `${floweringTreeCount} ağaçta son kayıt çiçeklenme bağlamını doğruluyor.`
      : 'Ağaç bazlı çiçeklenme saha kaydı bulunmadığı için sonuç yalnız hava penceresidir.',
  ];

  const warnings = [
    floweringTreeCount === 0
      ? 'Çiçeklenme doğrulanmadan bu kart “tozlaşma gerçekleşir” demez; yalnız meteorolojik pencereyi gösterir.'
      : '',
    'Çeşit/tozlayıcı uyumu, erkek-dişi çiçeklenme örtüşmesi ve gerçek arı/çiçek yoğunluğu doğrulanmadan verim garantisi üretilmez.',
    mode === 'insect'
      ? 'Böcek/arı profili yağış, güçlü rüzgâr ve serin havayı kısıtlayıcı kabul eden ihtiyatlı bir hava taramasıdır.'
      : 'Rüzgârla tozlaşan ürünlerde çok zayıf rüzgâr, yağış ve aşırı kuvvetli rüzgâr kısıtlayıcı kabul edilir.',
  ].filter(Boolean);

  return {
    version: 'pollination-v1',
    fieldId: input.fieldId,
    crop: input.crop,
    mode,
    modeLabel: pollinationModeLabel(mode),
    floweringTreeCount,
    floweringEvidence: floweringTreeCount > 0 ? 'confirmed' : 'not_recorded',
    timezone: forecast.timezone,
    generatedAt: new Date().toISOString(),
    updatedAt: forecast.updatedAt,
    today,
    days,
    windows,
    evidence,
    warnings,
  };
}
