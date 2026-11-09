import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canonicalizeNdviPixels, CANONICAL_NDVI_PALETTE } from './canonicalNdviRaster.ts';

test('Copernicus five-class NDVI palette stays identical on Home and History', () => {
  const pixels = new Uint8ClampedArray([
    230, 26, 20, 224,
    245, 110, 26, 219,
    242, 194, 31, 204,
    112, 191, 61, 194,
    13, 122, 46, 194,
    0, 0, 0, 0,
  ]);
  canonicalizeNdviPixels(pixels);
  for (let i = 0; i < CANONICAL_NDVI_PALETTE.length; i++) {
    assert.deepEqual(
      [...pixels.slice(i * 4, i * 4 + 4)],
      [...CANONICAL_NDVI_PALETTE[i].rgb, 255],
      `Class ${i} must not change by being drawn over satellite imagery`,
    );
  }
  assert.deepEqual([...pixels.slice(20, 24)], [0, 0, 0, 0], 'cloud/no-data remains transparent');
});

test('small RGB shifts restore original orange without classifying it as yellow', () => {
  const pixels = new Uint8ClampedArray([244, 109, 28, 216]);
  canonicalizeNdviPixels(pixels);
  assert.deepEqual([...pixels], [245, 110, 26, 255]);
});

test('both screens share canonical converter and home never smooths into 3 classes', () => {
  const home = readFileSync(new URL('../HomeMapEngine.tsx', import.meta.url), 'utf8');
  const history = readFileSync(new URL('../../map-data/components/SatelliteHistorySheet.tsx', import.meta.url), 'utf8');
  assert.match(home, /return canonicalizeNdviRaster\(imageUrl\);/);
  assert.doesNotMatch(home, /function makeSmoothNdviOverlay\(/);
  assert.match(home, /CANONICAL_NDVI_CACHE_VERSION/);
  assert.match(home, /'raster-resampling': 'nearest'/);
  assert.match(home, /'raster-opacity': 1/);
  assert.match(history, /canonicalizeNdviRaster\(source\)/);
  assert.match(history, /NDVI_IMAGE_PALETTE = CANONICAL_NDVI_PALETTE/);
});
