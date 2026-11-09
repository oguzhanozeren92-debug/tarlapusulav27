import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const file = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const guide = file('../../../assets/pusula/PusulaGuide.tsx');
const synthesis = file('../hooks/useHomePusula.ts');
const weather = file('../../../pages/Weather/WeatherHubScreen.tsx');

test('Pusula displays meaningful Turkish paragraphs and a field/date header', () => {
  assert.match(guide, /className="pusula-guide__context"/);
  assert.match(guide, /className="pusula-guide__structured"/);
  assert.match(guide, />Gözlem</);
  assert.match(guide, />Ne yapabilirsin\?</);
  assert.match(guide, />Birlikte incelenen veriler</);
  assert.match(guide, /toLocaleDateString\('tr-TR'/);
  assert.match(guide, /join\('\\n\\n'\)/);
});

test('Multi-layer synthesis is the first choice and cannot be overruled by an active-layer hotspot', () => {
  assert.match(synthesis, /Number\(visibleSynthesis\.layerCount\) >= 2/);
  assert.match(synthesis, /gozlem: synthesized/);
  assert.match(synthesis, /yonlendirme: synthesized/);
  assert.doesNotMatch(synthesis, /headline: `\$\{sourceAreaName\} bölümünü öncelikli kontrol et`/);
});

test('Calendar reminder needs an explicit tap and a selected field and date', () => {
  assert.match(guide, /onClick=\{\(\) => void saveCalendarAction\(\)\}/);
  assert.match(guide, /type="date"/);
  assert.match(guide, /if \(!suggestion\?\.fieldId \|\| calendarSaving\) return/);
  assert.match(guide, /await addQuickCalendarReminder\(/);
  assert.match(weather, /calendarAction: hasWeatherData && frostSignal/);
  assert.match(synthesis, /calendarAction: actionable/);
});

test('Pusula reports the actual data sources and not invented confirmations', () => {
  assert.match(synthesis, /Array\.isArray\(synthesized\?\.evidence\)/);
  assert.match(synthesis, /sources: synthesized \? sources : undefined/);
  assert.match(weather, /modelCount >= 1/);
  assert.match(weather, /Model tabanlı toprak nemi/);
});
