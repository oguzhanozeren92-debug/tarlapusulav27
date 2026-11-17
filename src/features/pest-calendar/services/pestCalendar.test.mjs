import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PEST_CALENDARS, calendarForCrop, entryMonths, splitByMonth } from '../data/pestCalendar.ts';
import { PEST_SOURCES } from '../data/sources.ts';
import { effectiveTemperatureSum, dayReachingTarget, isMildiyoDay } from './pestWeather.service.ts';

test('12 ürün grubu, uygulamadaki ürün adlarıyla eşleşir', () => {
  assert.equal(PEST_CALENDARS.length, 12);
  for (const name of ['Elma', 'Armut', 'Ayva', 'Buğday', 'Arpa', 'Üzüm', 'Domates', 'Zeytin', 'Kiraz', 'Vişne',
    'Mısır', 'Patates', 'Fındık', 'Kayısı', 'Pamuk', 'Çukurova Pamuğu', 'Ayçiçeği']) {
    assert.ok(calendarForCrop(name), name);
  }
  assert.equal(calendarForCrop('Marul'), null);
  assert.equal(calendarForCrop(''), null);
});

test('her satırın resmî kaynağı var; ilaç adı ya da doz yok', () => {
  const ids = new Set();
  const banned = /(\bml\b|\bg\/da\b|ml\/da|cc\/da|etken madde|% ?\d+\s*(ec|sc|wp|wg)\b)/i;
  for (const cal of PEST_CALENDARS) {
    for (const e of cal.girdiler) {
      assert.ok(PEST_SOURCES[e.kaynak], `${e.id} kaynağı tanımsız`);
      assert.ok(!ids.has(e.id), `${e.id} tekrar`);
      ids.add(e.id);
      for (const text of [e.zaman, e.izleme, e.esik, e.not].filter(Boolean)) {
        assert.ok(!banned.test(text), `${e.id}: ${text}`);
      }
      for (const m of e.aylar ?? []) assert.ok(m >= 1 && m <= 12);
    }
  }
  for (const s of Object.values(PEST_SOURCES)) assert.match(s.url, /^https:\/\/(www\.)?(tarimorman\.gov\.tr|bku\.tarimorman\.gov\.tr|arastirma\.tarimorman\.gov\.tr|[a-z]+\.tarimorman\.gov\.tr|www\.gapteyap\.org)\//);
});

test('ay/mevsim ayrımı', () => {
  const elma = calendarForCrop('Elma');
  const virgul = elma.girdiler.find((e) => e.id === 'virgul-kabuklubiti');
  assert.deepEqual(entryMonths(virgul), [1, 2, 4, 5, 7, 12]);
  const { thisMonth, phenology } = splitByMonth(elma, 12);
  assert.ok(thisMonth.some((e) => e.id === 'altin-kelebek'));
  assert.ok(phenology.some((e) => e.id === 'elma-kara-leke'));
});

test('gün-derece resmî formülle; 10 °C altı gün sıfır', () => {
  const days = [
    { date: '2026-05-01', tmax: 24, tmin: 12, tmean: null, rh: null }, // 8
    { date: '2026-05-02', tmax: 12, tmin: 2, tmean: null, rh: null },  // 0
    { date: '2026-05-03', tmax: 30, tmin: 16, tmean: null, rh: null }, // 13
    { date: '2026-05-04', tmax: null, tmin: 10, tmean: null, rh: null },
  ];
  const r = effectiveTemperatureSum(days, '2026-05-01', '2026-05-04');
  assert.deepEqual(r, { total: 21, counted: 3, missing: 1 });
  assert.equal(dayReachingTarget(days, '2026-05-01', 20), '2026-05-03');
  assert.equal(dayReachingTarget(days, '2026-05-02', 20), null);
});

test('mildiyö koşulu 19–22 °C ve nem ≥ %80', () => {
  assert.equal(isMildiyoDay({ date: 'x', tmax: 26, tmin: 15, tmean: 20, rh: 85 }), true);
  assert.equal(isMildiyoDay({ date: 'x', tmax: 26, tmin: 15, tmean: 20, rh: 70 }), false);
  assert.equal(isMildiyoDay({ date: 'x', tmax: 30, tmin: 20, tmean: 25, rh: 90 }), false);
  assert.equal(isMildiyoDay({ date: 'x', tmax: 24, tmin: 18, tmean: null, rh: 82 }), true);
});
