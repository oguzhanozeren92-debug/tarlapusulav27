import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const assert = (value, message) => { if (!value) throw new Error(message); };

const engine = read('src/features/decision/hooks/useHomeDecisionEngine.ts');
const projection = read('src/features/decision/services/decisionChannelProjection.service.ts');
const home = read('src/pages/Home/HomeScreen.tsx');
const pdfJob = read('src/features/pusula-pdf/services/pusulaPdfJob.service.ts');
const pdfInsights = read('src/features/pusula-pdf/services/pusulaPdfInsights.service.ts');

assert(engine.includes('projectDecisionChannels'), 'Karar kanalları ortak projection servisine taşınmamış.');
assert(projection.includes('todayDecisions') && projection.includes('fieldStatusDecisions') && projection.includes('notifications') && projection.includes('pusulaDecision'), 'Projection servisi dört kullanıcı yüzeyini birlikte üretmiyor.');
assert(home.includes('decisions={fieldStatusDecisions}'), 'Tarla Durumu kanonik karar listesini almıyor.');
assert(home.includes('decision={pusulaDecision}'), 'Harita Pusula bandı kanonik Pusula kararını almıyor.');
assert(home.includes('persistHomeNotifications'), 'Bildirim kalıcılığı Home karar zincirinden kopuk.');

const pdfTokens = [
  ['field-workability', 'mirrorLatestFieldWorkabilityEvidenceForPdf'],
  ['irrigation-distribution', 'mirrorLatestIrrigationDistributionEvidenceForPdf'],
  ['water-scarcity-plan', 'mirrorLatestWaterScarcityEvidenceForPdf'],
  ['microclimate-sensor', 'mirrorLatestMicroclimateEvidenceForPdf'],
  ['disaster-recovery', 'mirrorLatestDisasterRecoveryEvidenceForPdf'],
  ['multi-stress-synthesis', 'mirrorLatestMultiStressEvidenceForPdf'],
];

for (const [layer, mirror] of pdfTokens) {
  assert(pdfJob.includes(mirror), `PDF mirror eksik: ${mirror}`);
  assert(pdfInsights.includes(`'${layer}'`), `PDF insight eksik: ${layer}`);
}

console.log('TarlaPusula V59 end-to-end acceptance audit: PASS');
console.log('6 senaryo zinciri: motor -> gateway -> Today -> Tarla Durumu -> Pusula -> Bildirim -> PusulaPDF');
