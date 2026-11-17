import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthPests, dryDays, pestReminderText, checkinText, followUpAt } from './pestReminder.ts';

test('bu ayın listesi; boş ay null', () => {
  const nov = monthPests('Kayısı', 11);
  assert.ok(nov && nov.entries.some((e) => e.id === 'kayisi-cil'));
  assert.equal(monthPests('Marul', 5), null);
});

test('yağışsız günler tahminden', () => {
  const f = [
    { date: '2026-11-17', rain: 0 }, { date: '2026-11-18', rain: 3.2 }, { date: '2026-11-19', rain: 0.2 },
    { date: '2026-11-20', rain: null }, { date: '2026-11-21', rain: 0.4 },
  ];
  assert.deepEqual(dryDays(f, '2026-11-18'), ['2026-11-19', '2026-11-21']);
});

test('bildirim metinleri', () => {
  const nov = monthPests('Kayısı', 11);
  const t = pestReminderText({ fieldName: 'baskil-kayısı', crop: 'Kayısı', month: 11, entries: nov.entries, dry: ['2026-11-19', '2026-11-21'] });
  assert.match(t.message, /Kasım ayında takvimde .*Çil/);
  assert.match(t.message, /19 Kasım, 21 Kasım/);
  assert.ok(t.message.length <= 320);
  assert.match(pestReminderText({ fieldName: 'a', crop: 'Kayısı', month: 11, entries: nov.entries, dry: [] }).message, /her gününde yağış/);
  assert.match(checkinText({ fieldName: 'a', crop: 'Kayısı', pests: ['Çil'] }).message, /Yaptım.*Yapacağım.*Yapmayacağım/);
});

test('yapacağım → 5 gün sonra tekrar', () => {
  const now = new Date('2026-11-17T10:00:00Z');
  assert.equal(followUpAt('yapacagim', now).toISOString(), '2026-11-22T10:00:00.000Z');
  assert.equal(followUpAt('yaptim', now), null);
});
