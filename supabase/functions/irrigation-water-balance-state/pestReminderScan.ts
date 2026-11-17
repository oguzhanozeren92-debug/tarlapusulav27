/**
 * Zararlı takvimi aylık hatırlatması + ilaçlama yoklaması (cron, 30 dk'da bir).
 *
 * 1) Tarlanın ürününün takviminde bu ay izlenecek zararlı/hastalık varsa ve bu
 *    ay için kayıt yoksa: önümüzdeki 7 günün yağışsız günlerini Open-Meteo'dan
 *    alır, "Bu ay kontrol" bildirimi kuyruğa ekler, pest_spray_checkins satırı açar.
 * 2) Sorma zamanı gelmiş yoklamalar için "İlaçlama yaptın mı?" bildirimi.
 *    Cevap uygulamadaki Pusula kartından pest_spray_checkins'e yazılır.
 * Bildirimler "plant_health" kategorisindedir; kullanıcı tercihi ve sessiz
 * saatler dispatcher'da uygulanır. Yalnız 09–19 arası hazırlanır.
 */
import { checkinText, CHECKIN_AFTER_DAYS, CHECKIN_MAX_ASKS, dryDays, monthPests, pestReminderText } from "./pestCalendarCore/pestReminder.ts";

type Database = any;
const ZONE = "Europe/Istanbul";
const PER_RUN = 15;

function local(now: Date) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { iso: `${get("year")}-${get("month")}-${get("day")}`, month: Number(get("month")), ym: `${get("year")}-${get("month")}`, hour: Number(get("hour")) };
}
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const fieldLabel = (f: any) => String(f.name || "Tarlan").replace(/\s+/g, " ").trim().slice(0, 60);

async function forecastRain(lat: number, lng: number) {
  const u = new URL("https://api.open-meteo.com/v1/forecast");
  u.search = new URLSearchParams({ latitude: lat.toFixed(4), longitude: lng.toFixed(4), daily: "precipitation_sum", forecast_days: "8", timezone: ZONE }).toString();
  const r = await fetch(u, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error("Open-Meteo " + r.status);
  const d = (await r.json())?.daily ?? {};
  return (Array.isArray(d.time) ? d.time : []).map((date: string, i: number) => ({ date, rain: num(d.precipitation_sum?.[i]) }));
}

export async function enqueuePestCalendarReminders(db: Database, now = new Date()) {
  const stats = { monthly: 0, checkins: 0, skipped: 0, failed: 0, outsideWindow: false };
  const t = local(now);
  if (t.hour < 9 || t.hour >= 19) { stats.outsideWindow = true; return stats; }

  const [web, native] = await Promise.all([
    db.from("push_subscriptions").select("user_id").eq("enabled", true).limit(1000),
    db.from("native_push_tokens").select("user_id").eq("enabled", true).limit(1000),
  ]);
  if (web.error) throw web.error;
  const subscribed = [...new Set([...(web.data ?? []), ...(native.data ?? [])].map((r: any) => String(r.user_id ?? "")).filter(Boolean))];
  if (!subscribed.length) return stats;
  const prefs = await db.from("user_notification_preferences").select("user_id,push_enabled,plant_health_enabled").in("user_id", subscribed).limit(1000);
  if (prefs.error) throw prefs.error;
  const blocked = new Set((prefs.data ?? []).filter((r: any) => r.push_enabled === false || r.plant_health_enabled === false).map((r: any) => String(r.user_id)));
  const active = subscribed.filter((id) => !blocked.has(id));
  if (!active.length) return stats;

  // 1) Aylık hatırlatma
  const [fields, existing] = await Promise.all([
    db.from("fields").select("id,user_id,name,crop,latitude,longitude,parcel_centroid_lat,parcel_centroid_lng").in("user_id", active).limit(3000),
    db.from("pest_spray_checkins").select("field_id").eq("month", t.ym).limit(5000),
  ]);
  if (fields.error) throw fields.error;
  if (existing.error) throw existing.error;
  const done = new Set((existing.data ?? []).map((r: any) => String(r.field_id)));
  const due = (fields.data ?? []).filter((f: any) => !done.has(String(f.id)) && monthPests(f.crop, t.month)).slice(0, PER_RUN);

  for (const f of due) {
    try {
      const pests = monthPests(f.crop, t.month)!;
      const lat = num(f.parcel_centroid_lat) ?? num(f.latitude);
      const lng = num(f.parcel_centroid_lng) ?? num(f.longitude);
      let dry: string[] | null = null;
      if (lat !== null && lng !== null) {
        try { dry = dryDays(await forecastRain(lat, lng), t.iso); } catch { dry = null; }
      }
      const askAt = new Date(now); askAt.setDate(askAt.getDate() + CHECKIN_AFTER_DAYS);
      const ins = await db.from("pest_spray_checkins").insert({
        user_id: f.user_id, field_id: f.id, month: t.ym, crop: f.crop,
        pests: pests.entries.map((e) => e.ad), dry_days: dry ?? [], ask_at: askAt.toISOString(),
      }).select("id").maybeSingle();
      if (ins.error) { if (String(ins.error.code) === "23505") { stats.skipped++; continue; } throw ins.error; }
      const text = pestReminderText({ fieldName: fieldLabel(f), crop: f.crop, month: t.month, entries: pests.entries, dry });
      const { error } = await db.from("app_notifications").upsert({
        user_id: f.user_id, kind: "pest_calendar", source: "pusula-pest", severity: "info",
        title: text.title, message: text.message, target: "home",
        data: { fieldId: f.id, fieldName: fieldLabel(f), crop: f.crop, month: t.ym, pests: pests.entries.map((e) => e.ad),
          dryDays: dry ?? [], checkinId: ins.data?.id ?? null, actionTarget: "field-status:risk",
          source: "Tarım ve Orman Bakanlığı talimatları + Open-Meteo" },
        category: "plant_health", push_eligible: true, push_critical: false, push_available_at: now.toISOString(),
        dedupe_key: `pest-month:${f.user_id}:${f.id}:${t.ym}`,
      }, { onConflict: "dedupe_key", ignoreDuplicates: true });
      if (error) throw error;
      stats.monthly++;
    } catch (error) {
      stats.failed++;
      console.warn("[pest-month]", error instanceof Error ? error.message : error);
    }
  }

  // 2) İlaçlama yoklaması
  const pending = await db.from("pest_spray_checkins")
    .select("id,user_id,field_id,crop,pests,ask_at,asked_at,ask_count,response")
    .in("user_id", active).lte("ask_at", now.toISOString()).lt("ask_count", CHECKIN_MAX_ASKS)
    .or("response.is.null,response.eq.yapacagim").limit(200);
  if (pending.error) throw pending.error;
  const toAsk = (pending.data ?? []).filter((r: any) => !r.asked_at || Date.parse(r.asked_at) < Date.parse(r.ask_at)).slice(0, PER_RUN);
  if (toAsk.length) {
    const names = await db.from("fields").select("id,name").in("id", toAsk.map((r: any) => r.field_id));
    const nameOf = new Map((names.data ?? []).map((r: any) => [String(r.id), r]));
    for (const r of toAsk) {
      try {
        const fname = fieldLabel(nameOf.get(String(r.field_id)) ?? {});
        const text = checkinText({ fieldName: fname, crop: String(r.crop ?? ""), pests: r.pests ?? [] });
        const { error } = await db.from("app_notifications").upsert({
          user_id: r.user_id, kind: "pest_checkin", source: "pusula-pest", severity: "info",
          title: text.title, message: text.message, target: "home",
          data: { fieldId: r.field_id, fieldName: fname, checkinId: r.id, actionTarget: "pusula-checkin" },
          category: "plant_health", push_eligible: true, push_critical: false, push_available_at: now.toISOString(),
          dedupe_key: `pest-checkin:${r.id}:${Number(r.ask_count ?? 0) + 1}`,
        }, { onConflict: "dedupe_key", ignoreDuplicates: true });
        if (error) throw error;
        const upd = await db.from("pest_spray_checkins").update({ asked_at: now.toISOString(), ask_count: Number(r.ask_count ?? 0) + 1 }).eq("id", r.id);
        if (upd.error) throw upd.error;
        stats.checkins++;
      } catch (error) {
        stats.failed++;
        console.warn("[pest-checkin]", error instanceof Error ? error.message : error);
      }
    }
  }
  return stats;
}
