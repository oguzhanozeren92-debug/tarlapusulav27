/**
 * Zararlı takvimi için hava hesapları.
 *
 * - Etkili sıcaklık toplamı (gün-derece), talimatlardaki formülle:
 *   EST = Σ[(maksimum °C + minimum °C) / 2 − 10]. Ortalaması 10 °C altında
 *   kalan gün eksi yazılmaz, 0 sayılır (gelişme eşiği altı).
 * - Mildiyö salgın koşulu (domates/patates): ortalama sıcaklık 19–22 °C ve
 *   orantılı nem %80 ve üzeri.
 * Veriler Open-Meteo'dan gelir: ERA5 arşivi + tahmin modelinin son günleri.
 * Bunlar istasyon ölçümü değil, model/yeniden analiz değerleridir.
 */

export type TempDay = { date: string; tmax: number | null; tmin: number | null; tmean: number | null; rh: number | null; rain?: number | null };

export const EST_BASE = 10;
export const MILDIYO = { tMin: 19, tMax: 22, rhMin: 80 } as const;

const pad = (n: number) => String(n).padStart(2, '0');
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Başlangıç gününden (dahil) son güne kadar gün-derece; eksik gün sayısı ile. */
export function effectiveTemperatureSum(days: TempDay[], fromIso: string, toIso: string, base = EST_BASE) {
  let total = 0;
  let counted = 0;
  let missing = 0;
  for (const d of days) {
    if (d.date < fromIso || d.date > toIso) continue;
    if (d.tmax === null || d.tmin === null) { missing += 1; continue; }
    total += Math.max(0, (d.tmax + d.tmin) / 2 - base);
    counted += 1;
  }
  return { total: Math.round(total * 10) / 10, counted, missing };
}

/** Hedefe ulaşılacağı tahmini gün (yalnızca elde olan tahmin günleriyle). */
export function dayReachingTarget(days: TempDay[], fromIso: string, target: number, base = EST_BASE): string | null {
  let total = 0;
  for (const d of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    if (d.date < fromIso || d.tmax === null || d.tmin === null) continue;
    total += Math.max(0, (d.tmax + d.tmin) / 2 - base);
    if (total >= target) return d.date;
  }
  return null;
}

export function isMildiyoDay(d: TempDay): boolean {
  const mean = d.tmean ?? (d.tmax !== null && d.tmin !== null ? (d.tmax + d.tmin) / 2 : null);
  return mean !== null && d.rh !== null && mean >= MILDIYO.tMin && mean <= MILDIYO.tMax && d.rh >= MILDIYO.rhMin;
}

const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const VARS = 'temperature_2m_max,temperature_2m_min,temperature_2m_mean,relative_humidity_2m_mean,precipitation_sum';
const CACHE_PREFIX = 'tp-pest-weather:v2:';
const CACHE_TTL = 6 * 60 * 60 * 1000;

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
function parse(json: any): TempDay[] {
  const d = json?.daily;
  return (d?.time ?? []).map((date: string, i: number) => ({
    date,
    tmax: num(d.temperature_2m_max?.[i]), tmin: num(d.temperature_2m_min?.[i]),
    tmean: num(d.temperature_2m_mean?.[i]), rh: num(d.relative_humidity_2m_mean?.[i]),
    rain: num(d.precipitation_sum?.[i]),
  }));
}

/** `start` gününden bugüne + 7 günlük tahmin. Cihazda 6 saat saklanır. */
export async function loadPestWeather(lat: number, lng: number, start: Date, today: Date): Promise<{ past: TempDay[]; forecast: TempDay[] }> {
  const key = `${CACHE_PREFIX}${lat.toFixed(3)},${lng.toFixed(3)}:${isoDay(start)}`;
  const todayIso = isoDay(today);
  let stored: { at: number; past: TempDay[]; forecast: TempDay[] } | null = null;
  try { stored = JSON.parse(window.localStorage.getItem(key) ?? 'null'); } catch { stored = null; }
  if (stored && Date.now() - stored.at < CACHE_TTL) return { past: stored.past, forecast: stored.forecast };
  try {
    const byDate = new Map<string, TempDay>();
    const archiveEnd = new Date(today); archiveEnd.setDate(archiveEnd.getDate() - 6);
    if (archiveEnd > start) {
      const p = new URLSearchParams({ latitude: lat.toFixed(4), longitude: lng.toFixed(4),
        start_date: isoDay(start), end_date: isoDay(archiveEnd), daily: VARS, timezone: 'auto' });
      const res = await fetch(`${ARCHIVE}?${p}`);
      if (!res.ok) throw new Error(`Sıcaklık arşivi ${res.status}`);
      for (const d of parse(await res.json())) byDate.set(d.date, d);
    }
    const f = new URLSearchParams({ latitude: lat.toFixed(4), longitude: lng.toFixed(4),
      daily: VARS, past_days: '10', forecast_days: '7', timezone: 'auto' });
    const fres = await fetch(`${FORECAST}?${f}`);
    if (!fres.ok) throw new Error(`Hava servisi ${fres.status}`);
    const forecast: TempDay[] = [];
    for (const d of parse(await fres.json())) {
      if (d.date > todayIso) { forecast.push(d); continue; }
      if (d.date < isoDay(start)) continue;
      const prev = byDate.get(d.date);
      if (!prev || prev.tmax === null || prev.tmin === null) byDate.set(d.date, d);
    }
    const past = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
    try { window.localStorage.setItem(key, JSON.stringify({ at: Date.now(), past, forecast })); } catch { /* depolama dolu */ }
    return { past, forecast };
  } catch (error) {
    if (stored) return { past: stored.past, forecast: stored.forecast };
    throw error;
  }
}
