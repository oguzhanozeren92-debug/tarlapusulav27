import test from 'node:test';
import assert from 'node:assert/strict';
import {
  enqueueDailyWeatherNotifications,
  formatDailyWeatherMessage,
} from './dailyWeather.ts';

test('formats the forecast using actual values and clear units', () => {
  const result = formatDailyWeatherMessage('Karaağaç', {
    date: '2026-10-17',
    condition: 'parçalı bulutlu',
    tempMin: 11,
    tempMax: 20,
    windKmh: 21,
    rainChance: 42,
    humidityNow: 66,
  });
  assert.match(result, /Karaağaç tarlanız/);
  assert.match(result, /11–20°C/);
  assert.match(result, /rüzgâr 21 km\/sa/);
  assert.match(result, /yağış olasılığı %42/);
  assert.match(result, /şu an nem %66/);
});

test('does not invent humidity, wind or rain when the API does not provide them', () => {
  const result = formatDailyWeatherMessage('Güney Tarla', {
    date: '2026-10-17',
    condition: 'açık',
    tempMin: 2,
    tempMax: 14,
    windKmh: null,
    rainChance: null,
    humidityNow: null,
  });
  assert.match(result, /2–14°C/);
  assert.doesNotMatch(result, /nem|rüzgâr|yağış/);
});

test('respects Istanbul morning delivery window without accessing database', async () => {
  const result = await enqueueDailyWeatherNotifications(
    null, new Date('2026-10-17T03:00:00.000Z'),
  );
  assert.equal(result.outsideWindow, true);
  assert.equal(result.checked, 0);
  assert.equal(result.queued, 0);
});
