import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phClass, organicMatterClass, interpretSoil } from './soilInterpretation.ts';

test('USDA pH sınıfları', () => {
  assert.equal(phClass(7.0).label, 'nötr');
  assert.equal(phClass(7.4).label, 'hafif alkali');
  assert.equal(phClass(8.0).label, 'orta alkali');
  assert.equal(phClass(6.2).label, 'hafif asit');
  assert.equal(phClass(5.0).label, 'kuvvetli asit');
});

test('organik madde = OK × 1,724 ve sınıfı', () => {
  assert.equal(organicMatterClass(2.98), 'orta');
  const notes = interpretSoil({ texture: { sand: 25, silt: 45, clay: 30, label: 'Killi tın' }, ph: 7.4, ocGkg: 17.3,
    layers: [{ depth: '0-5 cm', clay: 29, sand: 26, silt: 45, ph: 7.3, oc: 20 }, { depth: '15-30 cm', clay: 30, sand: 25, silt: 45, ph: 7.4, oc: 15 }],
    intel: { hydraulic: { plant_available_water_vwc: 0.15, field_capacity_vwc: 0.33, wilting_point_vwc: 0.18, ksat_class: { label: 'Orta-yüksek' } } } });
  const titles = notes.map((n) => n.title).join(' | ');
  assert.match(titles, /pH 7,4 · hafif alkali/);
  assert.match(titles, /Organik madde ≈ %2,9 · orta/);
  assert.match(titles, /≈ 45 mm/);
  assert.match(titles, /Katmanlar birbirine benziyor/);
});
