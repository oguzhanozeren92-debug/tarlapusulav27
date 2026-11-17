import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeHarvestHolds, parsePhiDays, parsePhiInput, phiNote, daysUntil } from './preHarvestInterval.ts';

test('not biçimi yazılıp geri okunur', () => {
  assert.equal(parsePhiDays(`Dekara uygulama: 50 ml/da • ${phiNote(21)} • elle not`), 21);
  assert.equal(parsePhiDays('Toplam sulama suyu: 40 m³'), null);
  assert.equal(parsePhiInput(''), null);
  assert.equal(parsePhiInput('14'), 14);
  assert.equal(parsePhiInput('-3'), 'invalid');
  assert.equal(parsePhiInput('400'), 'invalid');
});

test('süren bekleme süreleri, en geç biten başta; bitenler ve diğer işlemler yok', () => {
  const acts = [
    { type: 'İlaçlama', activityDate: '2026-06-01', productName: 'A', notes: phiNote(7) },   // 8 Haziran bitti
    { type: 'İlaçlama', activityDate: '2026-06-10', productName: 'B', notes: phiNote(21) },  // 1 Temmuz
    { type: 'İlaçlama', activityDate: '2026-06-12', productName: 'C', notes: phiNote(14) },  // 26 Haziran
    { type: 'İlaçlama', activityDate: '2026-06-12', productName: 'D', notes: null },
    { type: 'Gübreleme', activityDate: '2026-06-12', productName: 'E', notes: phiNote(30) },
  ];
  const holds = activeHarvestHolds(acts, '2026-06-15');
  assert.deepEqual(holds.map((h) => [h.productName, h.safeFrom]), [['B', '2026-07-01'], ['C', '2026-06-26']]);
  assert.equal(daysUntil('2026-06-15', '2026-07-01'), 16);
});
