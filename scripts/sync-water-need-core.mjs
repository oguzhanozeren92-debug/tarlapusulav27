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
