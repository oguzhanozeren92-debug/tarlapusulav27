/**
 * Yağış sayacı: sezon başından bugüne tarlaya düşen yağışı ve kayıtlı
 * sulamaları biriktirir, rehberdeki sezon ihtiyacından düşer.
 *
 * - Günlük yağış ve referans su tüketimi (ET₀): Open-Meteo. Geçmiş için
 *   ERA5 arşivi (yaklaşık 5-6 gün gecikmeli), son günler için tahmin
 *   modelinin geçmiş günleri. Bunlar ölçüm değil, model/yeniden analiz verisidir.
 * - Bitkinin bu yılki gerçek tüketimi: rehberin Kc'si (ETc / ETo) × günlük ET₀.
 * - Etkili yağış rehberdeki gibi yağışın %80'i.
 * - Sulama kayıtları m³ olarak tutulur; dekar başına 1 m³ = 1 mm.
 */
import { EFFECTIVE_RAIN_RATIO } from './waterNeed.service';

export type DailyWeather = { date: string; rain: number | null; et0: number | null };
export type IrrigationRecord = { date: string; mm: number };

const MD = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const pad = (n: number) => String(n).padStart(2, '0');
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const decadeOfIso = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number);
  return (m - 1) * 3 + (d <= 10 ? 0 : d <= 20 ? 1 : 2);
};
const decadeStart = (year: number, k: number) => new Date(year, Math.floor(k / 3), [1, 11, 21][k % 3]);
const decadeEnd = (year: number, k: number) => {
  const m = Math.floor(k / 3);
  return new Date(year, m, k % 3 === 2 ? MD[m] : [10, 20][k % 3]);
};

export type SeasonWindow = { start: Date; end: Date; fromPlanting: boolean };

/**
 * Rehberdeki aktif 10 günlük dönemlerden bugünü içeren sezon (yıl sonunu
 * aşabilir). Bugün sezon dışındaysa null. Ekim tarihi kayıtlıysa ve sezona
 * uyuyorsa başlangıç olarak o kullanılır.
 */
export function seasonWindow(etc: number[], today: Date, plantingDate?: string | null): SeasonWindow | null {
  const now = (today.getMonth()) * 3 + (today.getDate() <= 10 ? 0 : today.getDate() <= 20 ? 1 : 2);
  if (!(etc[now] > 0)) return null;
  if (etc.every((v) => v > 0)) {
    const start = new Date(today.getFullYear(), 0, 1);
    return { start, end: new Date(today.getFullYear(), 11, 31), fromPlanting: false };
  }
  let back = 0;
  while (back < 35 && etc[(now - back - 1 + 36) % 36] > 0) back += 1;
  let fwd = 0;
  while (fwd < 35 && etc[(now + fwd + 1) % 36] > 0) fwd += 1;
  const startK = (now - back + 36) % 36;
  const endK = (now + fwd) % 36;
  const startYear = now - back < 0 ? today.getFullYear() - 1 : today.getFullYear();
  const endYear = now + fwd > 35 ? today.getFullYear() + 1 : today.getFullYear();
  let start = decadeStart(startYear, startK);
  let fromPlanting = false;
  if (plantingDate && /^\d{4}-\d{2}-\d{2}$/.test(plantingDate)) {
    const p = new Date(`${plantingDate}T00:00:00`);
    const earliest = new Date(start); earliest.setDate(earliest.getDate() - 60);
    if (p <= today && p >= earliest) { start = p; fromPlanting = true; }
  }
  return { start, end: decadeEnd(endYear, endK), fromPlanting };
}

export type RainLedger = {
  seasonStart: string;
  seasonEnd: string;
  fromPlanting: boolean;
  /** Rehber: sezonun tamamında bitkinin tükettiği su (uzun yıllar) */
  seasonNeed: number;
  rainTotal: number;
  effectiveRain: number;
  irrigation: number;
  /** Bu yılın havasıyla bitkinin bugüne kadar tükettiği su */
  usedSoFar: number;
  /** Sezon ihtiyacından yağış ve sulama düşülünce kalan */
  remaining: number;
  /** Bugüne kadar tüketilenin yağış+sulamayla karşılanmayan kısmı */
  deficitNow: number;
  daysCounted: number;
  missingDays: number;
  lastDate: string | null;
  rainEvents: Array<{ date: string; mm: number }>;
};

const r1 = (v: number) => Math.round(v * 10) / 10;

export function buildRainLedger(input: {
  etc: number[]; eto: number[]; window: SeasonWindow; today: Date;
  /** Rehberdeki sezon toplamı (satır toplamı yuvarlamadan birkaç mm farklı olabilir) */
  seasonTotal?: number;
  daily: DailyWeather[]; irrigation: IrrigationRecord[];
}): RainLedger {
  const startIso = isoDate(input.window.start);
  const todayIso = isoDate(input.today);
  const rows = input.daily.filter((d) => d.date >= startIso && d.date <= todayIso);
  let rain = 0; let used = 0; let missing = 0; let last: string | null = null;
  const events: Array<{ date: string; mm: number }> = [];
  for (const day of rows) {
    if (day.rain === null || day.et0 === null) { missing += 1; continue; }
    const k = decadeOfIso(day.date);
    const kc = input.eto[k] > 0 ? input.etc[k] / input.eto[k] : 0;
    rain += day.rain;
    used += kc * day.et0;
    last = day.date;
    if (day.rain >= 1) events.push({ date: day.date, mm: r1(day.rain) });
  }
  const irrigation = input.irrigation
    .filter((r) => r.date >= startIso && r.date <= todayIso && Number.isFinite(r.mm) && r.mm > 0)
    .reduce((s, r) => s + r.mm, 0);
  // Sezon ihtiyacı: sezon penceresine düşen rehber dönemleri.
  const seasonNeed = input.seasonTotal ?? input.etc.reduce((s, v) => s + v, 0);
  const effective = rain * EFFECTIVE_RAIN_RATIO;
  return {
    seasonStart: startIso,
    seasonEnd: isoDate(input.window.end),
    fromPlanting: input.window.fromPlanting,
    seasonNeed,
    rainTotal: r1(rain),
    effectiveRain: r1(effective),
    irrigation: r1(irrigation),
    usedSoFar: r1(used),
    remaining: r1(Math.max(0, seasonNeed - effective - irrigation)),
    deficitNow: r1(Math.max(0, used - effective - irrigation)),
    daysCounted: rows.length - missing,
    missingDays: missing,
    lastDate: last,
    rainEvents: events.reverse().slice(0, 8),
  };
}

/** Sulama işlem kayıtları (toplam m³) → mm. Alan yoksa veya m³ değilse sayılmaz. */
export function irrigationFromActivities(
  activities: Array<{ type: string; activityDate: string; quantity: number | null; unit: string | null }>,
  areaDa: number,
): IrrigationRecord[] {
  if (!(areaDa > 0)) return [];
  return activities
    .filter((a) => a.type === 'Sulama' && a.quantity !== null && a.quantity > 0 && (a.unit === 'm³' || a.unit === 'm3'))
    .map((a) => ({ date: a.activityDate.slice(0, 10), mm: (a.quantity as number) / areaDa }));
}

const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const CACHE_PREFIX = 'tp-rain-ledger:v1:';
const CACHE_TTL = 6 * 60 * 60 * 1000;

function parseDaily(payload: unknown): DailyWeather[] {
  const daily = (payload as { daily?: Record<string, unknown[]> } | null)?.daily;
  const time = (daily?.time ?? []) as string[];
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return time.map((date, i) => ({
    date, rain: num(daily?.precipitation_sum?.[i]), et0: num(daily?.et0_fao_evapotranspiration?.[i]),
  }));
}

/**
 * Sezon başından bugüne günlük yağış ve ET₀. Sonuç cihazda saklanır; 6 saatten
 * yeni kayıt varsa ağa çıkılmaz, ağ yoksa son kayıt kullanılır.
 */
export async function loadSeasonWeather(lat: number, lng: number, start: Date, today: Date): Promise<{ daily: DailyWeather[]; cached: boolean }> {
  const key = `${CACHE_PREFIX}${lat.toFixed(3)},${lng.toFixed(3)}:${isoDate(start)}`;
  let stored: { at: number; daily: DailyWeather[] } | null = null;
  try { stored = JSON.parse(window.localStorage.getItem(key) ?? 'null'); } catch { stored = null; }
  if (stored && Date.now() - stored.at < CACHE_TTL) return { daily: stored.daily, cached: true };

  try {
    const vars = 'precipitation_sum,et0_fao_evapotranspiration';
    const archiveEnd = new Date(today); archiveEnd.setDate(archiveEnd.getDate() - 6);
    const byDate = new Map<string, DailyWeather>();
    if (archiveEnd > start) {
      const p = new URLSearchParams({ latitude: lat.toFixed(4), longitude: lng.toFixed(4),
        start_date: isoDate(start), end_date: isoDate(archiveEnd), daily: vars, timezone: 'auto' });
      const res = await fetch(`${ARCHIVE}?${p}`);
      if (!res.ok) throw new Error(`Yağış arşivi ${res.status}`);
      for (const d of parseDaily(await res.json())) byDate.set(d.date, d);
    }
    const f = new URLSearchParams({ latitude: lat.toFixed(4), longitude: lng.toFixed(4),
      daily: vars, past_days: '10', forecast_days: '1', timezone: 'auto' });
    const fres = await fetch(`${FORECAST}?${f}`);
    if (!fres.ok) throw new Error(`Yağış servisi ${fres.status}`);
    for (const d of parseDaily(await fres.json())) {
      const prev = byDate.get(d.date);
      if (!prev || prev.rain === null || prev.et0 === null) byDate.set(d.date, d);
    }
    const daily = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
    try { window.localStorage.setItem(key, JSON.stringify({ at: Date.now(), daily })); } catch { /* depolama dolu */ }
    return { daily, cached: false };
  } catch (error) {
    if (stored) return { daily: stored.daily, cached: true };
    throw error;
  }
}
