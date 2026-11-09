/**
 * Canonical visual representation of Copernicus satellite-field-analysis NDVI.
 *
 * Source Sentinel-2 Process API PNG uses five fixed colours but partially
 * transparent pixels. Rendering over an aerial photo (Home) vs grey (History)
 * used to change those colours. Home also re-estimated the raw NDVI from the
 * colour image and smoothed it into a DIFFERENT three-class palette.
 *
 * This helper intentionally does not infer an NDVI number from colour.
 * It only restores the five already-classified source colours to fixed,
 * opaque display pixels; no-data stays transparent. Both screens consume
 * the same output. All numeric statistics still come from real raster data.
 */
export const CANONICAL_NDVI_PALETTE = [
  { rgb: [230, 26, 20] as const, value: 0.10 },
  { rgb: [245, 110, 26] as const, value: 0.275 },
  { rgb: [242, 194, 31] as const, value: 0.425 },
  { rgb: [112, 191, 61] as const, value: 0.575 },
  { rgb: [13, 122, 46] as const, value: 0.75 },
] as const;

export const CANONICAL_NDVI_CACHE_VERSION = 'ndvi-copernicus-five-colour-v1';

export function closestCanonicalNdviRgb(r: number, g: number, b: number) {
  let best: (typeof CANONICAL_NDVI_PALETTE)[number] = CANONICAL_NDVI_PALETTE[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const entry of CANONICAL_NDVI_PALETTE) {
    const dr = r - entry.rgb[0];
    const dg = g - entry.rgb[1];
    const db = b - entry.rgb[2];
    const distance = dr * dr + dg * dg + db * db;
    if (distance < bestDistance) {
      best = entry;
      bestDistance = distance;
    }
  }
  return best.rgb;
}

export function canonicalizeNdviPixels(bytes: Uint8ClampedArray) {
  for (let i = 0; i < bytes.length; i += 4) {
    // Preserve clouds/no-data outside the valid Sentinel mask.
    if (bytes[i + 3] === 0) continue;
    const rgb = closestCanonicalNdviRgb(bytes[i], bytes[i + 1], bytes[i + 2]);
    bytes[i] = rgb[0];
    bytes[i + 1] = rgb[1];
    bytes[i + 2] = rgb[2];
    bytes[i + 3] = 255;
  }
  return bytes;
}

// Concurrent Home/History requests for an identical image should share work.
const conversions = new Map<string, Promise<string>>();
const MAX_CONVERSIONS = 18;

export function canonicalizeNdviRaster(url: string): Promise<string> {
  if (!url || typeof Image === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(url);
  }
  const existing = conversions.get(url);
  if (existing) return existing;

  const convert = new Promise<string>((resolve) => {
    const image = new Image();
    if (!url.startsWith('data:')) image.crossOrigin = 'anonymous';

    image.onerror = () => resolve(url); // Never hide an available real NDVI image.
    image.onload = () => {
      try {
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        if (!width || !height) return resolve(url);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(url);
        ctx.drawImage(image, 0, 0);
        const pixels = ctx.getImageData(0, 0, width, height);
        canonicalizeNdviPixels(pixels.data);
        ctx.putImageData(pixels, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(url);
      }
    };
    image.src = url;
  });

  conversions.set(url, convert);
  if (conversions.size > MAX_CONVERSIONS) {
    const oldest = conversions.keys().next().value;
    if (oldest) conversions.delete(oldest);
  }
  return convert;
}
