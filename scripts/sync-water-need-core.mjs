// src/features/water-need/services altındaki saf hesap modüllerini
// send-due-reminders edge fonksiyonuna kopyalar (Deno uzantılı import ister).
// Kullanım: node scripts/sync-water-need-core.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const src = 'src/features/water-need/services/';
const dst = 'supabase/functions/send-due-reminders/waterNeedCore/';
mkdirSync(dst, { recursive: true });
for (const name of ['waterNeed.service.ts', 'rainLedger.service.ts', 'irrigationAlert.ts']) {
  const code = readFileSync(src + name, 'utf8')
    .replace(/from '\.\/(waterNeed\.service|rainLedger\.service|irrigationAlert)'/g, "from './$1.ts'");
  writeFileSync(dst + name, `// OTOMATİK KOPYA — düzenleme: ${src}${name}, sonra scripts/sync-water-need-core.mjs\n${code}`);
}
console.log('waterNeedCore güncellendi');
