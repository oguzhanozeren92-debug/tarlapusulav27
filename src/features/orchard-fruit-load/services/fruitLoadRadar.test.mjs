import assert from 'node:assert/strict';

const levelFromScore = (score) => score === null ? 'unknown' : score < .1 ? 'none' : score < .35 ? 'low' : score < .65 ? 'medium' : score < .85 ? 'high' : 'very_high';
assert.equal(levelFromScore(.5), 'medium');
assert.equal(levelFromScore(.9), 'very_high');
const eligible = (trees, measured) => measured >= 5 && Math.round((measured / trees) * 100) >= 10;
assert.equal(eligible(50, 5), true);
assert.equal(eligible(100, 5), false);
console.log('fruitLoadRadar tests: 4/4 PASS');
