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

// Zararlı takvimi: sunucu yalnız ürün → ay listesi kullanır (küçük paket).
const pestDst = 'supabase/functions/irrigation-water-balance-state/pestCalendarCore/';
mkdirSync(pestDst, { recursive: true });
const cal = await import('../src/features/pest-calendar/data/pestCalendar.ts');
const compact = cal.PEST_CALENDARS.map((c) => [c.ad, c.urunler,
  c.girdiler.map((e) => [e.ad, cal.entryMonths(e)]).filter((x) => x[1].length)]);
writeFileSync(pestDst + 'pestCalendar.ts', `// OTOMATİK ÜRETİLDİ — kaynak: src/features/pest-calendar/data/pestCalendar.ts, scripts/sync-water-need-core.mjs
export type PestEntry = { ad: string; aylar: number[] };
export type CropCalendar = { ad: string; girdiler: PestEntry[] };
const DATA: Array<[string, string[], Array<[string, number[]]>]> = ${JSON.stringify(compact)};
const fold = (v: string) => v.trim().toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
  .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/\\s+/g, ' ');
export function calendarForCrop(crop: string | null | undefined): CropCalendar | null {
  if (!crop) return null;
  const hit = DATA.find(([, urunler]) => urunler.some((u) => fold(u) === fold(crop)));
  return hit ? { ad: hit[0], girdiler: hit[2].map(([ad, aylar]) => ({ ad, aylar })) } : null;
}
export function splitByMonth(c: CropCalendar, month: number) {
  return { thisMonth: c.girdiler.filter((e) => e.aylar.includes(month)), phenology: [] as PestEntry[], other: [] as PestEntry[] };
}
`);
const rem = readFileSync('src/features/pest-calendar/services/pestReminder.ts', 'utf8')
  .replace(/from '\.\.\/data\/pestCalendar'/g, "from './pestCalendar.ts'");
writeFileSync(pestDst + 'pestReminder.ts', `// OTOMATİK KOPYA — düzenleme: src/features/pest-calendar/services/pestReminder.ts, sonra scripts/sync-water-need-core.mjs\n${rem}`);
console.log('pestCalendarCore güncellendi');
