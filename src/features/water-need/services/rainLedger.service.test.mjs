import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seasonWindow, buildRainLedger, irrigationFromActivities, isoDate } from './rainLedger.service.ts';

// Nisan II – Ağustos III aktif (dekad 10..23)
const etc = Array.from({ length: 36 }, (_, i) => (i >= 10 && i <= 23 ? 50 : 0));
const eto = Array.from({ length: 36 }, () => 40);

test('sezon penceresi: bugünü içeren aktif dönemler; sezon dışında yok', () => {
  const w = seasonWindow(etc, new Date(2026, 5, 15));
  assert.equal(isoDate(w.start), '2026-04-11');
  assert.equal(isoDate(w.end), '2026-08-31');
  assert.equal(seasonWindow(etc, new Date(2026, 10, 17)), null);
});

test('yıl sonunu aşan kışlık sezon geçen yıldan başlar', () => {
  const winter = Array.from({ length: 36 }, (_, i) => (i >= 30 || i <= 17 ? 20 : 0)); // Kasım I – Haziran III
  const w = seasonWindow(winter, new Date(2026, 1, 5));
  assert.equal(isoDate(w.start), '2025-11-01');
  assert.equal(isoDate(w.end), '2026-06-30');
});

test('kayıtlı ekim tarihi sezona yakınsa başlangıç olur, çok eskiyse olmaz', () => {
  assert.equal(isoDate(seasonWindow(etc, new Date(2026, 5, 15), '2026-04-25').start), '2026-04-25');
  assert.equal(seasonWindow(etc, new Date(2026, 5, 15), '2026-04-25').fromPlanting, true);
  assert.equal(isoDate(seasonWindow(etc, new Date(2026, 5, 15), '2025-04-25').start), '2026-04-11');
});

test('sayaç: kalan = sezon ihtiyacı − %80 yağış − sulama; açık = tüketilen − karşılanan', () => {
  const w = seasonWindow(etc, new Date(2026, 3, 20));
  const daily = [
    { date: '2026-04-11', rain: 10, et0: 4 },
    { date: '2026-04-12', rain: 0, et0: 5 },
    { date: '2026-04-13', rain: null, et0: null },
    { date: '2026-04-10', rain: 99, et0: 9 }, // sezondan önce, sayılmaz
  ];
  const l = buildRainLedger({ etc, eto, window: w, today: new Date(2026, 3, 20), daily,
    irrigation: [{ date: '2026-04-12', mm: 20 }, { date: '2026-03-01', mm: 50 }] });
  assert.equal(l.seasonNeed, 14 * 50);
  assert.equal(l.rainTotal, 10);
  assert.equal(l.effectiveRain, 8);
  assert.equal(l.irrigation, 20);
  assert.equal(l.usedSoFar, Math.round((4 + 5) * (50 / 40) * 10) / 10); // Kc = 1,25
  assert.equal(l.remaining, 700 - 8 - 20);
  assert.equal(l.deficitNow, 0);
  assert.equal(l.missingDays, 1);
  assert.deepEqual(l.rainEvents, [{ date: '2026-04-11', mm: 10 }]);
});

test('sulama kayıtları: yalnız m³ ve alan varsa mm olur', () => {
  const acts = [
    { type: 'Sulama', activityDate: '2026-06-01', quantity: 500, unit: 'm³' },
    { type: 'Sulama', activityDate: '2026-06-02', quantity: 3, unit: 'saat' },
    { type: 'Gübreleme', activityDate: '2026-06-03', quantity: 50, unit: 'kg' },
  ];
  assert.deepEqual(irrigationFromActivities(acts, 10), [{ date: '2026-06-01', mm: 50 }]);
  assert.deepEqual(irrigationFromActivities(acts, 0), []);
});
