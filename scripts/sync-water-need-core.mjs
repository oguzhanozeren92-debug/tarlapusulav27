// src/features/water-need/services altındaki saf hesap modüllerini
// irrigation-water-balance-state edge fonksiyonuna kopyalar (Deno uzantılı import ister).
// Kullanım: node scripts/sync-water-need-core.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const src = 'src/features/water-need/services/';
const dst = 'supabase/functions/irrigation-water-balance-state/waterNeedCore/';
mkdirSync(dst, { recursive: true });
for (const name of ['waterNeed.service.ts', 'rainLedger.service.ts', 'irrigationAlert.ts']) {
  const code = readFileSync(src + name, 'utf8')
    .replace(/from '\.\/(waterNeed\.service|rainLedger\.service|irrigationAlert)'/g, "from './$1.ts'");
  writeFileSync(dst + name, `// OTOMATİK KOPYA — düzenleme: ${src}${name}, sonra scripts/sync-water-need-core.mjs\n${code}`);
}
console.log('waterNeedCore güncellendi');

// Zararlı takvimi verisi ve bildirim metinleri (aylık hatırlatma + ilaçlama yoklaması).
const pestDst = 'supabase/functions/irrigation-water-balance-state/pestCalendarCore/';
mkdirSync(pestDst, { recursive: true });
for (const [from, name] of [
  ['src/features/pest-calendar/data/', 'pestCalendar.ts'],
  ['src/features/pest-calendar/services/', 'pestReminder.ts'],
]) {
  let code = readFileSync(from + name, 'utf8').replace(/from '\.\.\/data\/pestCalendar'/g, "from './pestCalendar.ts'");
  if (name === 'pestCalendar.ts') {
    // Sunucu yalnız ad/ay bilgisini kullanır; açıklama metinleri kopyalanmaz.
    const { PEST_CALENDARS } = await import('../' + from + name);
    const slim = PEST_CALENDARS.map((c) => ({ key: c.key, ad: c.ad, urunler: c.urunler, kapsam: c.kapsam,
      girdiler: c.girdiler.map((e) => ({ id: e.id, ad: e.ad, tur: e.tur, aylar: e.aylar, mevsim: e.mevsim, zaman: '', kaynak: e.kaynak })) }));
    const start = code.indexOf('export const PEST_CALENDARS');
    const end = code.indexOf('\n];\n', start) + 4;
    code = code.slice(0, start) + `export const PEST_CALENDARS: CropCalendar[] = ${JSON.stringify(slim)};\n` + code.slice(end);
  }
  writeFileSync(pestDst + name, `// OTOMATİK KOPYA — düzenleme: ${from}${name}, sonra scripts/sync-water-need-core.mjs\n${code}`);
}
console.log('pestCalendarCore güncellendi');
