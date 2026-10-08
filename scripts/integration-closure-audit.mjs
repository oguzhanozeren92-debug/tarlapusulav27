import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const assert = (ok, message) => {
  if (!ok) throw new Error(message);
};

const engine = read('src/features/decision/hooks/useHomeDecisionEngine.ts');
const home = read('src/pages/Home/HomeScreen.tsx');
const fieldStatus = read('src/features/field-status/components/FieldStatusCenter.tsx');

const requiredEngineTokens = [
  'useFieldWorkabilityContext',
  'buildFieldWorkabilityDecision',
  'useIrrigationDistributionContext',
  'buildIrrigationDistributionDecision',
  'useWaterScarcityPlanContext',
  'buildWaterScarcityDecision',
  'useMicroclimateSensorContext',
  'buildMicroclimateSensorDecision',
  'useDisasterRecoveryContext',
  'buildDisasterRecoveryDecision',
  'buildMultiStressSynthesis',
  'buildMultiStressDecision',
  'persistMultiStressSynthesis',
  'fieldStatusDecisions',
];

for (const token of requiredEngineTokens) {
  assert(engine.includes(token), `HomeDecisionEngine bağlantısı eksik: ${token}`);
}

assert(
  home.includes('decisions={fieldStatusDecisions}'),
  'Tarla Durumu tüm kanonik kararları almıyor.',
);
assert(
  home.includes('decision={pusulaDecision}') && home.includes('onOpenDecision={openHomeInsightTarget}'),
  'Harita Pusula bandı kanonik Pusula kararına bağlı değil.',
);
assert(
  home.includes('home-decision-${pusulaDecision.id}') && home.includes('pusulaDecision.gateway?.confidence'),
  'Ana Pusula logosu merkezi karar motorunu kullanmıyor.',
);
assert(
  fieldStatus.includes('<MicroclimateSensorPanel fieldId={fieldId} />'),
  'Mikroiklim/Sensör paneli Tarla Durumu veri ayrıntısına bağlı değil.',
);

console.log('TarlaPusula V58 integration closure audit: PASS');
console.log('Connected: workability, irrigation-distribution, water-scarcity, microclimate, disaster-recovery, multi-stress, Field Status, Home Pusula.');
