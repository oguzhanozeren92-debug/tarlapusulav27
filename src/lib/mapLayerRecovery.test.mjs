import test from 'node:test';
import assert from 'node:assert/strict';
import {
  swapRecoverableImageOverlay,
  ensureRecoverableImageOverlay,
  clearRecoverableImageOverlay,
} from './mapLayerRecovery.ts';

const originalWindow = globalThis.window;
const originalImage = globalThis.Image;

class LoadedImage {
  onload = null;
  onerror = null;
  set src(_value) {
    queueMicrotask(() => this.onload?.());
  }
}

function fakeMap() {
  const sources = new Map();
  const layers = new Map();
  let installs = 0;
  return {
    sources, layers,
    get installs() { return installs; },
    getSource(id) { return sources.get(id); },
    getLayer(id) { return layers.get(id); },
    addSource(id, source) { sources.set(id, source); },
    addLayer(layer) { installs += 1; layers.set(layer.id, layer); },
    removeSource(id) { sources.delete(id); },
    removeLayer(id) { layers.delete(id); },
    isStyleLoaded() { return true; },
    on() {},
    once() {},
    off() {},
    resize() {},
  };
}

const spec = (url) => ({
  key: 'home-inline-overlay',
  url,
  coordinates: [[40, 39], [41, 39], [41, 38], [40, 38]],
  paint: { 'raster-opacity': 0.82 },
});

test('repeated style recovery shares a single in-flight NDVI install', async () => {
  globalThis.window = { setTimeout, clearTimeout };
  globalThis.Image = LoadedImage;
  try {
    const map = fakeMap();
    const one = swapRecoverableImageOverlay(map, spec('data:image/png;base64,first'));
    const two = swapRecoverableImageOverlay(map, spec('data:image/png;base64,first'));
    const three = ensureRecoverableImageOverlay(map, 'home-inline-overlay');
    assert.deepEqual(await Promise.all([one, two, three]), [true, true, true]);
    assert.equal(map.installs, 1, 'only one raster image layer should be installed');
    assert.equal(await swapRecoverableImageOverlay(map, spec('data:image/png;base64,first')), true);
    assert.equal(map.installs, 1, 'repeated request for visible NDVI must not re-install it');

    const replacement = swapRecoverableImageOverlay(map, spec('data:image/png;base64,newer'));
    assert.ok(map.layers.has('home-inline-overlay--layer-a'), 'old NDVI stays until newer image is ready');
    assert.equal(await replacement, true);
    assert.equal(map.installs, 2);
    assert.ok(map.layers.has('home-inline-overlay--layer-b'));
    assert.equal(map.layers.has('home-inline-overlay--layer-a'), false);
    clearRecoverableImageOverlay(map, 'home-inline-overlay');
  } finally {
    globalThis.window = originalWindow;
    globalThis.Image = originalImage;
  }
});

test('home map keeps same-field NDVI and caches raw images before smooth rendering', async () => {
  const { readFileSync } = await import('node:fs');
  const home = readFileSync(new URL('../features/home-map/HomeMapEngine.tsx', import.meta.url), 'utf8');
  assert.match(home, /persistLatestSnapshot\(satelliteData\.ndviImage\);/);
  assert.match(home, /sameFieldNdviStillVisible/);
  assert.match(home, /renderedNdviFieldKeyRef\.current === homeMapFieldKey/);
  assert.match(home, /renderedLayerRequestKeyRef\.current\.startsWith\('vegetation:'\)/);
});
