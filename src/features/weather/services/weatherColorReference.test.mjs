import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const weather = readFileSync(new URL('../../../pages/Weather/WeatherHubScreen.tsx', import.meta.url),'utf8');
const nav = readFileSync(new URL('../../../components/ClassicBottomNav.tsx',import.meta.url),'utf8');

test('colorful reference keeps real field forecast, action handlers and advanced data', () => {
  for (const token of [
    'tp-color-hero-head','tp-color-frost','tp-color-metrics',
    'tp-color-five-day-grid','tp-color-pusula','tp-color-advanced',
    'fiveDayForecast[index]','weatherDayLabel(index)',
    'weatherArtKind(day.condition)','showSources',
    'setSprayGuideOpen(true)',"setPremiumDetailOpen('rain-history')",
    "setPremiumDetailOpen('surface-temperature')",
    "setPremiumDetailOpen('field-climate')",
    "setPremiumDetailOpen('et0')",
  ]) assert.ok(weather.includes(token),token);
});

test('rain probability and missing measurements never appear as invented zeroes',()=>{
  assert.match(weather,/const rainProbability = safeNumber\(firstDay\?\.precipitationProbability\)/);
  assert.match(weather,/rainProbability === null \? '—' :/);
  assert.match(weather,/surfaceTemperatureValue === null \? '—' :/);
});

test('calendar reminder is only stored after explicit user action',()=>{
  assert.match(weather,/onClick=\{\(\) => \{\s*setScheduleDate/);
  assert.match(weather,/onClick=\{\(\) => void saveWeatherPlan\(\)\}/);
  assert.match(weather,/await addQuickCalendarReminder\(\{/);
  assert.match(weather,/fieldId: String\(weatherField\.id\)/);
  assert.match(weather,/reminderDate: scheduleDate/);
});

test('weather navigation remains isolated from the rest of app',()=>{
  assert.match(nav,/variant\?: 'default' \| 'weather'/);
  assert.match(nav,/tp-classic-bottom-nav--weather/);
  assert.match(weather,/variant="weather"/);
  assert.match(weather,/tp-wxr-page/);
});

test('small-screen design has fixed five-column tiles and protects horizontal overflow',()=>{
  assert.match(weather,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(weather,/overflow-x:clip!important/);
  assert.match(weather,/@media\(max-width:375px\)/);
});
