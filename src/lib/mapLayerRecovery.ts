type MapLike = {
  addSource: (id: string, source: any) => void;
  addLayer: (layer: any, beforeId?: string) => void;
  getSource: (id: string) => any;
  getLayer: (id: string) => any;
  removeSource: (id: string) => void;
  removeLayer: (id: string) => void;
  isStyleLoaded: () => boolean;
  once: (event: string, listener: (...args: any[]) => void) => any;
  on: (event: string, listener: (...args: any[]) => void) => any;
  off: (event: string, listener: (...args: any[]) => void) => any;
  resize: () => void;
  getContainer?: () => HTMLElement;
};

type ImageCoordinates = [
  [number, number],
  [number, number],
  [number, number],
  [number, number],
];

export type RecoverableImageOverlaySpec = {
  key: string;
  url: string;
  coordinates: ImageCoordinates;
  beforeLayerId?: string;
  paint?: Record<string, unknown>;
};

type OverlayState = {
  requestId: number;
  activeSlot: 'a' | 'b' | null;
  spec: RecoverableImageOverlaySpec | null;
  recoveryTimer: number | null;
};

const overlayStates = new WeakMap<object, Map<string, OverlayState>>();
const installedLifecycle = new WeakSet<object>();
const lifecycleCleanups = new WeakMap<object, () => void>();

function stateFor(map: MapLike, key: string): OverlayState {
  let byKey = overlayStates.get(map as object);
  if (!byKey) {
    byKey = new Map();
    overlayStates.set(map as object, byKey);
  }

  let state = byKey.get(key);
  if (!state) {
    state = {
      requestId: 0,
      activeSlot: null,
      spec: null,
      recoveryTimer: null,
    };
    byKey.set(key, state);
  }

  return state;
}

function sourceId(key: string, slot: 'a' | 'b') {
  return `${key}--source-${slot}`;
}

function layerId(key: string, slot: 'a' | 'b') {
  return `${key}--layer-${slot}`;
}

function safeRemove(map: MapLike, key: string, slot: 'a' | 'b') {
  const lid = layerId(key, slot);
  const sid = sourceId(key, slot);

  try {
    if (map.getLayer(lid)) map.removeLayer(lid);
  } catch {
    // Style değişirken katman zaten kaldırılmış olabilir.
  }

  try {
    if (map.getSource(sid)) map.removeSource(sid);
  } catch {
    // Style değişirken kaynak zaten kaldırılmış olabilir.
  }
}

function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function waitForStyle(map: MapLike, timeoutMs = 5000) {
  if (map.isStyleLoaded()) return Promise.resolve(true);

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const done = (value: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      try {
        map.off('load', onLoad);
      } catch {
        // no-op
      }
      resolve(value);
    };
    const onLoad = () => done(true);
    const timer = window.setTimeout(() => done(map.isStyleLoaded()), timeoutMs);
    try {
      map.once('load', onLoad);
    } catch {
      done(false);
    }
  });
}

function preloadImage(url: string, timeoutMs = 9000) {
  return new Promise<boolean>((resolve) => {
    if (!url) {
      resolve(false);
      return;
    }

    const image = new Image();
    let settled = false;
    const done = (value: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      resolve(value);
    };

    const timer = window.setTimeout(() => done(false), timeoutMs);
    image.onload = () => done(true);
    image.onerror = () => done(false);
    image.decoding = 'async';
    image.src = url;
  });
}

async function preloadWithRetry(url: string) {
  const delays = [0, 700, 1800];
  for (const delay of delays) {
    if (delay) await wait(delay);
    if (await preloadImage(url)) return true;
  }
  return false;
}

function scheduleVerify(map: MapLike, key: string) {
  const state = stateFor(map, key);
  if (state.recoveryTimer != null) {
    window.clearTimeout(state.recoveryTimer);
  }

  state.recoveryTimer = window.setTimeout(() => {
    state.recoveryTimer = null;
    void ensureRecoverableImageOverlay(map, key);
  }, 1600);
}

export async function swapRecoverableImageOverlay(
  map: MapLike,
  spec: RecoverableImageOverlaySpec,
): Promise<boolean> {
  const state = stateFor(map, spec.key);
  const requestId = state.requestId + 1;
  state.requestId = requestId;
  state.spec = spec;

  // Yeni görüntünün gerçekten yüklenebildiğini doğrulamadan son başarılı
  // rastera dokunma. Böylece ağ/geçici servis hatası haritayı çıplak bırakmaz.
  const imageReady = await preloadWithRetry(spec.url);
  if (!imageReady || requestId !== state.requestId) return false;

  const styleReady = await waitForStyle(map);
  if (!styleReady || requestId !== state.requestId) return false;

  const nextSlot: 'a' | 'b' = state.activeSlot === 'a' ? 'b' : 'a';
  const nextSourceId = sourceId(spec.key, nextSlot);
  const nextLayerId = layerId(spec.key, nextSlot);

  // Önce kullanılmayan slotu temizle. Aktif slot bu aşamada hâlâ görünür.
  safeRemove(map, spec.key, nextSlot);

  try {
    map.addSource(nextSourceId, {
      type: 'image',
      url: spec.url,
      coordinates: spec.coordinates,
    });

    map.addLayer(
      {
        id: nextLayerId,
        type: 'raster',
        source: nextSourceId,
        paint: {
          'raster-opacity': 0.8,
          'raster-resampling': 'linear',
          'raster-fade-duration': 0,
          ...(spec.paint ?? {}),
        },
      },
      spec.beforeLayerId && map.getLayer(spec.beforeLayerId)
        ? spec.beforeLayerId
        : undefined,
    );
  } catch (error) {
    safeRemove(map, spec.key, nextSlot);
    console.warn(`Harita katmanı kurulamadı (${spec.key}). Son başarılı katman korunuyor.`, error);
    return false;
  }

  // Yeni katman eklendikten sonra kısa bir render fırsatı ver; sonra eski slotu kaldır.
  await wait(60);

  if (requestId !== state.requestId) {
    safeRemove(map, spec.key, nextSlot);
    return false;
  }

  const previousSlot = state.activeSlot;
  state.activeSlot = nextSlot;

  if (previousSlot && previousSlot !== nextSlot) {
    safeRemove(map, spec.key, previousSlot);
  }

  scheduleVerify(map, spec.key);
  return true;
}

export async function ensureRecoverableImageOverlay(map: MapLike, key: string) {
  const state = stateFor(map, key);
  const spec = state.spec;
  if (!spec) return false;

  const activeSlot = state.activeSlot;
  if (
    activeSlot &&
    map.getLayer(layerId(key, activeSlot)) &&
    map.getSource(sourceId(key, activeSlot))
  ) {
    return true;
  }

  // Stil yeniden yüklendi / WebView geri geldi ve kaynak düştüyse aynı
  // son başarılı isteği yeniden kur.
  state.activeSlot = null;
  return swapRecoverableImageOverlay(map, spec);
}

export function clearRecoverableImageOverlay(map: MapLike, key: string) {
  const state = stateFor(map, key);
  state.requestId += 1;
  state.spec = null;
  if (state.recoveryTimer != null) {
    window.clearTimeout(state.recoveryTimer);
    state.recoveryTimer = null;
  }
  safeRemove(map, key, 'a');
  safeRemove(map, key, 'b');
  state.activeSlot = null;
}

export function installMapLifecycleRecovery(map: MapLike) {
  if (installedLifecycle.has(map as object)) {
    return lifecycleCleanups.get(map as object) ?? (() => undefined);
  }
  installedLifecycle.add(map as object);

  let resizeTimer: number | null = null;
  let observer: ResizeObserver | null = null;

  const recover = () => {
    if (resizeTimer != null) window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      resizeTimer = null;
      try {
        map.resize();
      } catch {
        // map kapanmış olabilir
      }

      const byKey = overlayStates.get(map as object);
      if (!byKey) return;
      for (const key of byKey.keys()) {
        void ensureRecoverableImageOverlay(map, key);
      }
    }, 80);
  };

  const onVisibility = () => {
    if (document.visibilityState === 'visible') recover();
  };

  const onStyleData = () => {
    // styledata çok sık gelebilir; recover debounce edilir ve yalnız kayıp
    // katmanları yeniden kurar.
    recover();
  };

  window.addEventListener('focus', recover);
  window.addEventListener('orientationchange', recover);
  document.addEventListener('visibilitychange', onVisibility);
  try {
    map.on('styledata', onStyleData);
  } catch {
    // no-op
  }

  try {
    const container = map.getContainer?.();
    if (container && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => recover());
      observer.observe(container);
    }
  } catch {
    // no-op
  }

  const cleanup = () => {
    if (resizeTimer != null) window.clearTimeout(resizeTimer);
    window.removeEventListener('focus', recover);
    window.removeEventListener('orientationchange', recover);
    document.removeEventListener('visibilitychange', onVisibility);
    observer?.disconnect();
    try {
      map.off('styledata', onStyleData);
    } catch {
      // no-op
    }

    const byKey = overlayStates.get(map as object);
    if (byKey) {
      for (const state of byKey.values()) {
        state.requestId += 1;
        if (state.recoveryTimer != null) {
          window.clearTimeout(state.recoveryTimer);
          state.recoveryTimer = null;
        }
      }
      overlayStates.delete(map as object);
    }

    lifecycleCleanups.delete(map as object);
  };

  lifecycleCleanups.set(map as object, cleanup);
  return cleanup;
}
