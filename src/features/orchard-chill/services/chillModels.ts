import type { OrchardChillModelMetrics } from '../types/orchardChill';

function finite(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * MGM BİSİP'in güncel bilgilendirmesinde tarif edilen Klasik Yöntem:
 * saatlik sıcaklık 0 °C ile 7,2 °C arasındaysa bir soğuklama saati sayılır.
 * Donma noktası altındaki sıcaklıklar bu metrikte sayılmaz.
 */
export function calculateMgmClassicChillHours(hourlyTemperaturesC: unknown[]) {
  let hours = 0;
  for (const raw of hourlyTemperaturesC) {
    const temperature = finite(raw);
    if (temperature === null) continue;
    if (temperature >= 0 && temperature <= 7.2) hours += 1;
  }
  return hours;
}

/** Richardson et al. (1974) Utah Chill Unit modeli. */
export function utahUnitForTemperature(temperatureC: number) {
  if (temperatureC < 1.5) return 0;
  if (temperatureC < 2.5) return 0.5;
  if (temperatureC < 9.2) return 1;
  if (temperatureC < 12.5) return 0.5;
  if (temperatureC <= 16) return 0;
  if (temperatureC <= 18) return -0.5;
  return -1;
}

export function calculateUtahChillUnits(hourlyTemperaturesC: unknown[]) {
  return hourlyTemperaturesC.reduce<number>((sum, raw) => {
    const temperature = finite(raw);
    return temperature === null ? sum : sum + utahUnitForTemperature(temperature);
  }, 0);
}

/**
 * Fishman/Erez Dynamic Model. Sabitler chillR'nin yaygın horticultural
 * uygulamasındaki Dynamic_Model implementasyonuyla aynıdır.
 */
export function calculateDynamicChillPortions(hourlyTemperaturesC: unknown[]) {
  const temperatures = hourlyTemperaturesC
    .map(finite)
    .filter((value): value is number => value !== null);

  if (temperatures.length < 2) return 0;

  const E0 = 4153.5;
  const E1 = 12888.8;
  const A0 = 139500;
  const A1 = 2567000000000000000;
  const slope = 1.6;
  const Tf = 277;
  const aa = A0 / A1;
  const ee = E1 - E0;

  const xi: number[] = [];
  const xs: number[] = [];
  const eak1: number[] = [];

  for (const temperature of temperatures) {
    const tk = temperature + 273;
    const sr = Math.exp((slope * Tf * (tk - Tf)) / tk);
    xi.push(sr / (1 + sr));
    xs.push(aa * Math.exp(ee / tk));
    eak1.push(Math.exp(-A1 * Math.exp(-E1 / tk)));
  }

  const intermediate = new Array<number>(temperatures.length).fill(0);
  for (let index = 1; index < temperatures.length; index += 1) {
    const sourceIndex = index - 1;
    let start = intermediate[index - 1];
    if (start >= 1 && sourceIndex > 0) {
      start *= 1 - xi[sourceIndex - 1];
    }
    intermediate[index] = xs[sourceIndex] - (xs[sourceIndex] - start) * eak1[sourceIndex];
  }

  let portions = 0;
  for (let index = 1; index < intermediate.length; index += 1) {
    if (intermediate[index] >= 1) {
      portions += intermediate[index] * xi[index - 1];
    }
  }

  return portions;
}

export function calculateAllChillModels(
  hourlyTemperaturesC: unknown[],
): OrchardChillModelMetrics {
  return {
    classicHours: calculateMgmClassicChillHours(hourlyTemperaturesC),
    utahUnits: Math.round(calculateUtahChillUnits(hourlyTemperaturesC) * 10) / 10,
    chillPortions: Math.round(calculateDynamicChillPortions(hourlyTemperaturesC) * 10) / 10,
  };
}
