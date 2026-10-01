import assert from 'node:assert/strict';

function build(live) {
  const preferred = ['brix', 'fruit_size_mm', 'fruit_weight_g', 'moisture_pct'];
  if (!live?.snapshot) return { status: 'unavailable', metrics: [] };
  const q = live.snapshot.quality;
  const metrics = preferred.filter((key) => q.measurements?.[key] != null);
  if (q.status !== 'measured' || !metrics.length) return { status: 'not_measured', metrics: [] };
  return { status: 'measured', metrics };
}

assert.equal(build(null).status, 'unavailable');
assert.equal(build({ snapshot: { quality: { status: 'not_measured', measurements: {} } } }).status, 'not_measured');
assert.deepEqual(
  build({ snapshot: { quality: { status: 'measured', measurements: { brix: 18.2, protein_pct: 12 } } } }).metrics,
  ['brix'],
);
assert.equal(
  build({ snapshot: { quality: { status: 'measured', measurements: { protein_pct: 12 } } } }).status,
  'not_measured',
);
console.log('orchardQualitySummary tests: 4/4 passed');
