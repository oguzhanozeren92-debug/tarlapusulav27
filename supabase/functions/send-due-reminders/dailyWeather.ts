/**
 * Sabah hava durumu: mevcut app_notifications + push kuyruğunu kullanır.
 * Kullanıcının favori (yoksa ilk) gerçek tarlası; günde tek bildirim.
 * Yalnızca cron tarafından, Türkiye saatiyle 08.00-12.00 arasında çağrılır.
 */
type Database = any;

type FieldRow = {
  id: string;
  user_id: string;
  name: string | null;
  latitude: number | null;
  longitude: number | null;
  parcel_centroid_lat: number | null;
  parcel_centroid_lng: number | null;
  is_favorite: boolean | null;
  created_at: string | null;
};

type Forecast = {
  date: string;
  condition: string;
  tempMin: number | null;
  tempMax: number | null;
  windKmh: number | null;
  rainChance: number | null;
  humidityNow: number | null;
};

const ZONE = "Europe/Istanbul";
const BATCH_SIZE = 36;
const CONCURRENCY = 6;

function n(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function coordinates(field: FieldRow) {
  const latitude = n(field.parcel_centroid_lat) ?? n(field.latitude);
  const longitude = n(field.parcel_centroid_lng) ?? n(field.longitude);
  if (
    latitude === null || longitude === null ||
    Math.abs(latitude) > 90 || Math.abs(longitude) > 180
  ) return null;
  return { latitude, longitude };
}

function localClock(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONE, hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "-1");
  return { hour };
}

function localDay(now: Date) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

function weatherCondition(code: number) {
  if (code === 0) return "açık";
  if ([1, 2].includes(code)) return "parçalı bulutlu";
  if (code === 3) return "kapalı";
  if ([45, 48].includes(code)) return "sisli";
  if ([51, 53, 55, 56, 57].includes(code)) return "çisentili";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "yağmurlu";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "karlı";
  if ([95, 96, 99].includes(code)) return "gök gürültülü";
  return "değişken";
}

async function forecastForField(field: FieldRow, day: string): Promise<Forecast> {
  const point = coordinates(field);
  if (!point) throw new Error("Tarla koordinatları eksik.");
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(point.latitude));
  url.searchParams.set("longitude", String(point.longitude));
  url.searchParams.set("timezone", ZONE);
  url.searchParams.set("forecast_days", "1");
  url.searchParams.set("daily",
    "weather_code,temperature_2m_min,temperature_2m_max,precipitation_probability_max,wind_speed_10m_max");
  url.searchParams.set("current", "relative_humidity_2m");

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error("Open-Meteo HTTP " + response.status);
  const data = await response.json();
  const daily = data?.daily;
  if (String(daily?.time?.[0] ?? "") !== day) {
    throw new Error("Bugüne ait hava tahmini alınamadı.");
  }
  const tempMin = n(daily.temperature_2m_min?.[0]);
  const tempMax = n(daily.temperature_2m_max?.[0]);
  if (tempMin === null || tempMax === null) {
    throw new Error("Sıcaklık tahmini eksik.");
  }
  return {
    date: day,
    condition: weatherCondition(Number(daily.weather_code?.[0] ?? -1)),
    tempMin,
    tempMax,
    windKmh: n(daily.wind_speed_10m_max?.[0]),
    rainChance: n(daily.precipitation_probability_max?.[0]),
    humidityNow: n(data?.current?.relative_humidity_2m),
  };
}

export function formatDailyWeatherMessage(fieldName: string, forecast: Forecast) {
  const safeName = String(fieldName || "Tarlan")
    .replace(/\s+/g, " ").trim().slice(0, 70) || "Tarlan";
  const parts = [
    Math.round(forecast.tempMin ?? 0) + "–" + Math.round(forecast.tempMax ?? 0) + "°C",
  ];
  if (forecast.windKmh !== null) {
    parts.push("rüzgâr " + Math.round(forecast.windKmh) + " km/sa");
  }
  if (forecast.rainChance !== null) {
    parts.push("yağış olasılığı %" + Math.round(forecast.rainChance));
  }
  if (forecast.humidityNow !== null) {
    parts.push("şu an nem %" + Math.round(forecast.humidityNow));
  }
  return (safeName + " tarlanız için bugün " + forecast.condition +
    " bir hava bekleniyor. " + parts.join(" • ") + ".").slice(0, 310);
}

export async function enqueueDailyWeatherNotifications(
  db: Database,
  now = new Date(),
) {
  const day = localDay(now);
  const stats = { day, queued: 0, skipped: 0, failed: 0, checked: 0, outsideWindow: false };

  // Saat 08:00-11:59 arası cron her 15 dakikada çalışır.
  if (localClock(now).hour < 8 || localClock(now).hour >= 12) {
    stats.outsideWindow = true;
    return stats;
  }

  const [web, native] = await Promise.all([
    db.from("push_subscriptions")
      .select("user_id").eq("enabled", true).limit(500),
    db.from("native_push_tokens")
      .select("user_id").eq("enabled", true).limit(500),
  ]);
  if (web.error) throw web.error;
  if (native.error) {
    // Eski ortamlarda native tablo eksik olsa da web push sürer.
    console.warn("Günlük hava native cihaz listesi okunamadı:", native.error.message);
  }
  const subscribed = Array.from(new Set(
    [...(web.data ?? []), ...(native.data ?? [])]
      .map((row: any) => String(row.user_id ?? "")).filter(Boolean),
  ));
  if (!subscribed.length) return stats;

  const existing = await db.from("app_notifications")
    .select("dedupe_key")
    .like("dedupe_key", "daily-weather:%:" + day)
    .limit(1500);
  if (existing.error) throw existing.error;
  const sentOrQueued = new Set(
    (existing.data ?? []).map((row: any) => String(row.dedupe_key ?? "")),
  );
  let pending = subscribed.filter((userId) =>
    !sentOrQueued.has("daily-weather:" + userId + ":" + day));
  if (!pending.length) return stats;

  // Kullanıcı tercihi kapalıysa hava tahmini bile sorgulama.
  const prefs = await db.from("user_notification_preferences")
    .select("user_id,push_enabled,weather_enabled")
    .in("user_id", pending).limit(1000);
  if (prefs.error) throw prefs.error;
  const prefByUser = new Map((prefs.data ?? []).map((row: any) =>
    [String(row.user_id), row]));
  pending = pending.filter((id) => {
    const pref: any = prefByUser.get(id);
    return pref?.push_enabled !== false && pref?.weather_enabled !== false;
  });
  if (!pending.length) return stats;

  const fields = await db.from("fields")
    .select("id,user_id,name,latitude,longitude,parcel_centroid_lat,parcel_centroid_lng,is_favorite,created_at")
    .in("user_id", pending)
    .order("is_favorite", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(2000);
  if (fields.error) throw fields.error;

  const byUser = new Map<string, FieldRow>();
  const orderedFields = ([...(fields.data ?? [])] as FieldRow[]).sort((a, b) =>
    Number(b.is_favorite === true) - Number(a.is_favorite === true) ||
    String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
  for (const field of orderedFields) {
    if (!byUser.has(String(field.user_id)) && coordinates(field)) {
      byUser.set(String(field.user_id), field);
    }
  }

  const candidates = pending
    .filter((id) => byUser.has(id))
    .slice(0, BATCH_SIZE);

  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    const group = candidates.slice(i, i + CONCURRENCY);
    await Promise.all(group.map(async (userId) => {
      const field = byUser.get(userId)!;
      stats.checked++;
      try {
        const forecast = await forecastForField(field, day);
        const inserted = await db.from("app_notifications")
          .upsert({
            user_id: userId,
            kind: "weather",
            source: "open-meteo",
            severity: "info",
            title: "Günlük Hava Durumu",
            message: formatDailyWeatherMessage(field.name || "Tarlan", forecast),
            target: "weatherHub",
            data: {
              weatherFieldId: field.id,
              fieldName: field.name || "Tarlan",
              forecastDate: day,
              actionTarget: "weatherHub",
              source: "Open-Meteo",
            },
            category: "weather",
            push_eligible: true,
            push_critical: false,
            push_available_at: now.toISOString(),
            dedupe_key: "daily-weather:" + userId + ":" + day,
          }, { onConflict: "dedupe_key", ignoreDuplicates: true })
          .select("id").maybeSingle();
        if (inserted.error) throw inserted.error;
        if (inserted.data?.id) stats.queued++;
        else stats.skipped++;
      } catch (error) {
        stats.failed++;
        console.warn("Günlük hava bildirimi oluşturulamadı:", {
          fieldId: field.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }));
  }
  return stats;
}
