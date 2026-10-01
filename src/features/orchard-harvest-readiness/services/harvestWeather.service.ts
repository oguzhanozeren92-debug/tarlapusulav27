import type { Field, WeatherForecastDay } from '../../../types';

function finite(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function fetchHarvestWorkForecast(field: Field): Promise<WeatherForecastDay[]> {
  const latitude = finite(field.parcelCentroidLat ?? field.latitude);
  const longitude = finite(field.parcelCentroidLng ?? field.longitude);
  if (latitude === null || longitude === null) return [];

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(latitude));
  url.searchParams.set('longitude', String(longitude));
  url.searchParams.set('forecast_days', '5');
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('daily', 'temperature_2m_min,temperature_2m_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max');

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return [];
    const payload = await response.json();
    const daily = payload?.daily ?? {};
    const times: unknown[] = Array.isArray(daily.time) ? daily.time : [];
    return times.map((value, index) => ({
      date: String(value),
      tempMin: finite(daily.temperature_2m_min?.[index]),
      tempMax: finite(daily.temperature_2m_max?.[index]),
      humidity: null,
      precipitation: finite(daily.precipitation_sum?.[index]),
      precipitationProbability: finite(daily.precipitation_probability_max?.[index]),
      windSpeed: finite(daily.wind_speed_10m_max?.[index]),
      condition: '',
    }));
  } catch {
    return [];
  } finally {
    window.clearTimeout(timer);
  }
}
