import assert from 'node:assert/strict';

const DAY_MS = 86400000;
const fruitStages = new Set(['fruit_set', 'fruit_growth', 'maturation', 'harvest_window']);

function scoreObservation(observation, days, alternance = false) {
  let score = 0;
  const reasons = [];
  let urgent = false;
  if (!observation) { score += 30; reasons.push('no_observation'); }
  else {
    if (observation.stressLevel === 'high') { score += 70; urgent = true; reasons.push('high_stress'); }
    else if (observation.stressLevel === 'medium') { score += 35; reasons.push('medium_stress'); }
    if (observation.waterStatus === 'stress') { score += 70; urgent = true; reasons.push('water_stress'); }
    else if (observation.waterStatus === 'watch') { score += 30; reasons.push('water_watch'); }
    if (days > 90) { score += 35; reasons.push('stale_observation'); }
    else if (days > 45) { score += 22; reasons.push('stale_observation'); }
    if (fruitStages.has(observation.stage) && ['low','none'].includes(observation.fruitLoad)) {
      score += observation.fruitLoad === 'none' ? 24 : 16; reasons.push('low_fruit_load');
    }
  }
  if (alternance) { score += 25; reasons.push('alternance'); }
  return { score, reasons, urgent };
}

const high = scoreObservation({ stressLevel:'high', waterStatus:'normal', stage:'fruit_growth', fruitLoad:'medium' }, 2);
assert.equal(high.urgent, true);
assert.ok(high.score >= 70);

const missing = scoreObservation(undefined, null);
assert.deepEqual(missing.reasons, ['no_observation']);

const fruitLow = scoreObservation({ stressLevel:'none', waterStatus:'normal', stage:'fruit_growth', fruitLoad:'low' }, 2);
assert.ok(fruitLow.reasons.includes('low_fruit_load'));

const dormantLow = scoreObservation({ stressLevel:'none', waterStatus:'normal', stage:'dormancy', fruitLoad:'low' }, 2);
assert.equal(dormantLow.reasons.includes('low_fruit_load'), false);

const alternating = scoreObservation({ stressLevel:'none', waterStatus:'normal', stage:'fruit_growth', fruitLoad:'medium' }, 2, true);
assert.ok(alternating.reasons.includes('alternance'));

console.log('5/5 orchard tree priority tests passed');
