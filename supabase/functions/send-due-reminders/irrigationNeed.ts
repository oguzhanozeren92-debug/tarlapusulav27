/**
 * Günlük sulama ihtiyacı taraması: uzun süre kayda değer yağış yoksa, bitkinin
 * su açığı birikmişse ve yakında yağış beklenmiyorsa "Sulama zamanı" bildirimi.
 *
 * - Bitki su tüketimi: TAGEM–DSİ rehberi (uygulamanın public/data dosyası).
 * - Yağış ve ET₀: Open-Meteo (ERA5 arşivi + tahmin modeli).
 * - Kural ve hesap: uygulamadaki kartla aynı kod (waterNeedCore, otomatik kopya).
 * - Her tarla günde en fazla bir kez kontrol edilir; bildirim tarla başına
 *   haftada bir kez gider. Kuru tarım olarak kayıtlı tarlalar bildirim almaz.
 * - Kullanıcının "sulama" bildirim tercihi ve sessiz saatleri dispatcher'da uygulanır.
 */
import {
  calculateWaterNeed, pickStation, matchRehberCrops, type WaterNeedDataset,
} from "./waterNeedCore/waterNeed.service.ts";
import {
  buildRainLedger, irrigationFromActivities, isoDate, seasonWindow, type DailyWeather,
} from "./waterNeedCore/rainLedger.service.ts";
import { evaluateIrrigationAlert } from "./waterNeedCore/irrigationAlert.ts";

type Database = any;
const DATA_URL = Deno.env.get("WATER_NEED_DATA_URL") ||
  "https://tarlapusulav27.vercel.app/data/bitki-su-tuketimi.json";
const ZONE = "Europe/Istanbul";
const PER_RUN = 10;
const CHECK_EVERY_MS = 20 * 60 * 60 * 1000;

let datasetCache: { at: number; data: WaterNeedDataset } | null = null;
async function dataset(): Promise<WaterNeedDataset> {
  if (datasetCache && Date.now() - datasetCache.at < 12 * 60 * 60 * 1000) return datasetCache.data;
  const res = await fetch(DATA_URL, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error("Su tüketimi verisi " + res.status);
  const data = await res.json() as WaterNeedDataset;
  if (!Array.isArray(data?.istasyonlar) || data.istasyonlar.length < 200) throw new Error("Su tüketimi verisi eksik.");
  datasetCache = { at: Date.now(), data };
  return data;
}

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

function localNow(now: Date) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const iso = `${get("year")}-${get("month")}-${get("day")}`;
  return { iso, hour: Number(get("hour")), date: new Date(`${iso}T12:00:00`) };
}

function parseDaily(payload: any): DailyWeather[] {
  const d = payload?.daily ?? {};
  const time: string[] = Array.isArray(d.time) ? d.time : [];
  return time.map((date, i) => ({
    date, rain: num(d.precipitation_sum?.[i]), et0: num(d.et0_fao_evapotranspiration?.[i]),
  }));
}

async function seasonWeather(lat: number, lng: number, start: Date, todayIso: string) {
  const vars = "precipitation_sum,et0_fao_evapotranspiration";
  const byDate = new Map<string, DailyWeather>();
  const archiveEnd = new Date(`${todayIso}T00:00:00Z`);
  archiveEnd.setUTCDate(archiveEnd.getUTCDate() - 6);
  if (archiveEnd > start) {
    const a = new URL("https://archive-api.open-meteo.com/v1/archive");
    a.search = new URLSearchParams({ latitude: lat.toFixed(4), longitude: lng.toFixed(4),
      start_date: isoDate(start), end_date: archiveEnd.toISOString().slice(0, 10), daily: vars, timezone: ZONE }).toString();
    const r = await fetch(a, { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new Error("Open-Meteo arşiv " + r.status);
    for (const d of parseDaily(await r.json())) byDate.set(d.date, d);
  }
  const f = new URL("https://api.open-meteo.com/v1/forecast");
  f.search = new URLSearchParams({ latitude: lat.toFixed(4), longitude: lng.toFixed(4),
    daily: vars, past_days: "10", forecast_days: "8", timezone: ZONE }).toString();
  const r = await fetch(f, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error("Open-Meteo tahmin " + r.status);
  const forecast: DailyWeather[] = [];
  for (const d of parseDaily(await r.json())) {
    if (d.date > todayIso) { forecast.push(d); continue; }
    const prev = byDate.get(d.date);
    if (!prev || prev.rain === null || prev.et0 === null) byDate.set(d.date, d);
  }
  return { daily: [...byDate.values()].sort((x, y) => x.date.localeCompare(y.date)), forecast };
}

function weekKey(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7; // Pazartesi = 0
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

const fmt = (v: number) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(v);

export async function enqueueFieldIrrigationNeedAlerts(db: Database, now = new Date()) {
  const stats = { checked: 0, queued: 0, skipped: 0, failed: 0, outsideWindow: false };
  const local = localNow(now);
  // Bildirim gündüz hazırlanır; sessiz saatler ayrıca dispatcher'da uygulanır.
  if (local.hour < 7 || local.hour >= 19) { stats.outsideWindow = true; return stats; }

  const [web, native] = await Promise.all([
    db.from("push_subscriptions").select("user_id").eq("enabled", true).limit(500),
    db.from("native_push_tokens").select("user_id").eq("enabled", true).limit(500),
  ]);
  if (web.error) throw web.error;
  const subscribed = [...new Set([...(web.data ?? []), ...(native.data ?? [])]
    .map((row: any) => String(row.user_id ?? "")).filter(Boolean))];
  if (!subscribed.length) return stats;
  const prefs = await db.from("user_notification_preferences")
    .select("user_id,push_enabled,irrigation_enabled").in("user_id", subscribed).limit(500);
  if (prefs.error) throw prefs.error;
  const blocked = new Set((prefs.data ?? []).filter((r: any) => r.push_enabled === false || r.irrigation_enabled === false)
    .map((r: any) => String(r.user_id)));
  const active = subscribed.filter((id) => !blocked.has(id));
  if (!active.length) return stats;

  const [fields, checks] = await Promise.all([
    db.from("fields")
      .select("id,user_id,name,crop,area_decare,city,latitude,longitude,parcel_centroid_lat,parcel_centroid_lng,irrigation_status,season")
      .in("user_id", active).limit(2000),
    db.from("irrigation_need_scan_state").select("field_id,last_checked_at").limit(5000),
  ]);
  if (fields.error) throw fields.error;
  if (checks.error) throw checks.error;
  const lastCheck = new Map<string, number>((checks.data ?? []).map((r: any) =>
    [String(r.field_id), Date.parse(String(r.last_checked_at ?? "")) || 0]));
  const queue = (fields.data ?? []).filter((f: any) =>
    f.crop && f.irrigation_status !== "rainfed" &&
    (num(f.parcel_centroid_lat) ?? num(f.latitude)) !== null &&
    now.getTime() - (lastCheck.get(String(f.id)) ?? 0) >= CHECK_EVERY_MS)
    .sort((a: any, b: any) => (lastCheck.get(String(a.id)) ?? 0) - (lastCheck.get(String(b.id)) ?? 0))
    .slice(0, PER_RUN);
  if (!queue.length) return stats;

  const data = await dataset();
  for (const field of queue) {
    stats.checked++;
    let lastError: string | null = null;
    let result: Record<string, unknown> | null = null;
    try {
      const lat = (num(field.parcel_centroid_lat) ?? num(field.latitude))!;
      const lng = (num(field.parcel_centroid_lng) ?? num(field.longitude))!;
      const pick = pickStation(data.istasyonlar, field.crop, { lat, lng, city: field.city });
      const crop = pick ? matchRehberCrops(field.crop, Object.keys(pick.station.bitkiler))[0] : null;
      if (!pick || !crop || !calculateWaterNeed(pick.station, crop, { system: "yuzey", today: local.date })) {
        stats.skipped++; result = { reason: "rehberde-yok" };
      } else {
        const season = await db.from("field_seasons").select("planting_date")
          .eq("field_id", field.id).eq("year", field.season).maybeSingle();
        const win = seasonWindow(pick.station.bitkiler[crop].etc, local.date, season.data?.planting_date ?? null);
        if (!win) { stats.skipped++; result = { reason: "sezon-disi" }; }
        else {
          const [weather, acts] = await Promise.all([
            seasonWeather(lat, lng, win.start, local.iso),
            db.from("activities").select("activity_type,activity_date,quantity,unit")
              .eq("field_id", field.id).eq("activity_type", "Sulama").gte("activity_date", isoDate(win.start)).limit(500),
          ]);
          const area = num(field.area_decare) ?? 0;
          const ledger = buildRainLedger({
            etc: pick.station.bitkiler[crop].etc, eto: pick.station.eto, window: win, today: local.date,
            seasonTotal: pick.station.bitkiler[crop].toplam, daily: weather.daily,
            irrigation: irrigationFromActivities((acts.data ?? []).map((a: any) => ({
              type: a.activity_type, activityDate: String(a.activity_date), quantity: num(a.quantity), unit: a.unit,
            })), area),
          });
          const alert = evaluateIrrigationAlert({ ledger, daily: weather.daily, forecast: weather.forecast, todayIso: local.iso });
          result = { status: alert.status, deficit: ledger.deficitNow, dryDays: alert.dryDays, forecastRain: alert.forecastRain, station: pick.station.ad, crop };
          if (alert.status !== "sulama-zamani") stats.skipped++;
          else {
            const name = String(field.name || "Tarlan").replace(/\s+/g, " ").trim().slice(0, 60);
            const message = (`${name} (${field.crop}): ${alert.dryDays} gündür kayda değer yağış yok, bitkinin su açığı yaklaşık ${fmt(ledger.deficitNow)} mm (dekara ${fmt(ledger.deficitNow)} ton). ` +
              (alert.forecastRain > 0 ? `Önümüzdeki 3 günde yalnızca ${String(alert.forecastRain).replace(".", ",")} mm yağış bekleniyor. ` : "Önümüzdeki 3 günde yağış beklenmiyor. ") +
              "Sulama yapman önerilir; sulama yaptıysan İşlemler'e kaydet, sayaç güncellensin.").slice(0, 320);
            const { data: row, error } = await db.from("app_notifications").upsert({
              user_id: field.user_id, kind: "irrigation", source: "pusula-water", severity: "warning",
              title: "Pusula · Sulama zamanı", message, target: "home",
              data: { fieldId: field.id, fieldName: name, crop: field.crop, deficitMm: ledger.deficitNow,
                remainingMm: ledger.remaining, dryDays: alert.dryDays, forecastRainMm: alert.forecastRain,
                station: pick.station.ad, source: "TAGEM-DSİ rehberi + Open-Meteo", actionTarget: "field-detail" },
              category: "irrigation", push_eligible: true, push_critical: false,
              push_available_at: now.toISOString(),
              dedupe_key: `irrigation-need:${field.user_id}:${field.id}:${weekKey(local.iso)}`,
            }, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("id").maybeSingle();
            if (error) throw error;
            if (row?.id) stats.queued++; else stats.skipped++;
          }
        }
      }
    } catch (error) {
      stats.failed++;
      lastError = error instanceof Error ? error.message.slice(0, 200) : "irrigation_scan_error";
    }
    const saved = await db.from("irrigation_need_scan_state").upsert({
      field_id: field.id, user_id: field.user_id, last_checked_at: now.toISOString(),
      last_error: lastError, last_result: result,
    }, { onConflict: "field_id" });
    if (saved.error) console.warn("Sulama tarama kaydı başarısız:", saved.error.message);
  }
  return stats;
}
