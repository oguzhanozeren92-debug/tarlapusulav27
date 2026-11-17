/**
 * "Sulama zamanı" kuralı — uygulamadaki kart ve sunucudaki günlük bildirim
 * taraması aynı eşikleri kullanır (supabase/functions/irrigation-need-scan/irrigationNeed.ts).
 * Sulama: uzun süredir kayda değer yağış yok + su açığı birikmiş + yakında yağış beklenmiyor.
 */
import type { DailyWeather, RainLedger } from './rainLedger.service';

export const IRRIGATION_ALERT = {
  /** Bu kadar gündür ≥ significantRainMm yağış yoksa "uzun süre yağışsız" */
  dryDays: 10,
  significantRainMm: 5,
  /** Bitkinin karşılanmamış tüketimi (mm = ton/da) */
  minDeficitMm: 25,
  /** Önümüzdeki bu kadar günde beklenen yağış bunun altındaysa sulama önerilir */
  forecastDays: 3,
  forecastRainMm: 5,
} as const;

export type IrrigationAlert = {
  status: 'sulama-zamani' | 'yagis-bekleniyor' | 'gerek-yok';
  dryDays: number;
  forecastRain: number;
  nextRainDate: string | null;
};

export function evaluateIrrigationAlert(input: {
  ledger: RainLedger; daily: DailyWeather[]; forecast: DailyWeather[]; todayIso: string;
}): IrrigationAlert {
  const past = input.daily.filter((d) => d.date >= input.ledger.seasonStart && d.date <= input.todayIso);
  const lastWet = [...past].reverse().find((d) => (d.rain ?? 0) >= IRRIGATION_ALERT.significantRainMm);
  const from = lastWet?.date ?? input.ledger.seasonStart;
  const dryDays = Math.max(0, Math.round((Date.parse(`${input.todayIso}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000));
  const upcoming = input.forecast.filter((d) => d.date > input.todayIso).slice(0, IRRIGATION_ALERT.forecastDays);
  const forecastRain = Math.round(upcoming.reduce((s, d) => s + (d.rain ?? 0), 0) * 10) / 10;
  const nextRainDate = input.forecast.find((d) => d.date > input.todayIso && (d.rain ?? 0) >= IRRIGATION_ALERT.significantRainMm)?.date ?? null;
  const thirsty = input.ledger.deficitNow >= IRRIGATION_ALERT.minDeficitMm && dryDays >= IRRIGATION_ALERT.dryDays;
  const status = !thirsty ? 'gerek-yok'
    : forecastRain >= IRRIGATION_ALERT.forecastRainMm ? 'yagis-bekleniyor' : 'sulama-zamani';
  return { status, dryDays, forecastRain, nextRainDate };
}
