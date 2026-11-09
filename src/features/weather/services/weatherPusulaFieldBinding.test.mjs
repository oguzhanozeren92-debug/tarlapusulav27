import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const app = src('../../../App.tsx');
const shell = src('../../../app/AppShell.tsx');
const band = src('../../../components/GlobalPusulaBand.tsx');
const weather = src('../../../pages/Weather/WeatherHubScreen.tsx');

test('WeatherHub selected field ID reaches global Pusula, not favourite field', () => {
  assert.match(app, /weatherHubFieldId=\{weatherHubFieldId\}/);
  assert.match(shell, /screen === 'weatherHub'/);
  assert.match(shell, /String\(field\.id\) === String\(weatherHubFieldId\)/);
  assert.match(shell, /fieldName=\{pusulaField\?\.name \?\? null\}/);
  assert.match(shell, /fieldId=\{pusulaField\?\.id/);
});

test('Weather event must belong to active field before entering the insight cache', () => {
  const gate = band.indexOf("if (screen === 'weatherHub') {\n        // Weather events always carry");
  const cacheWrite = band.indexOf("window.sessionStorage.setItem(\n          `tp_pusula_screen_insight_${screen}`");
  assert.ok(gate > 0 && cacheWrite > gate);
  assert.match(band, /incomingId !== expectedId/);
  assert.match(band, /incomingField !== expectedField/);
  assert.match(band, /readCachedWeatherPusula\(fieldName, fieldId\)/);
});

test('Fallback no-weather claim is removed and only real forecasts are announced', () => {
  assert.doesNotMatch(band, /id: 'weather-manual-fallback'/);
  assert.match(band, /setInsight\(buildGuideInsight\(screen, guideTurn/);
  assert.match(weather, /if \(typeof window === 'undefined' \|\| !hasWeatherData \|\| !weatherKey\) return;/);
  assert.match(weather, /tp_pusula_weather_latest_v3/);
  assert.match(band, /tp_pusula_weather_latest_v3/);
  assert.match(band, /Date\.now\(\) - Number\(parsed\.savedAt\) > 8 \* 60 \* 60 \* 1000/);
});
