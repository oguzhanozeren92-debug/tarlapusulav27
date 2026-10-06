export const NDVI_LOW_MAX = 0.30;
export const NDVI_HIGH_MIN = 0.60;

export const NDVI_ABSOLUTE_COLORS = {
  low: '#e2472a',
  medium: '#f2b705',
  high: '#4caf50',
} as const;

export const NDVI_ABSOLUTE_RGB = {
  low: { r: 226, g: 71, b: 42 },
  medium: { r: 242, g: 183, b: 5 },
  high: { r: 76, g: 175, b: 80 },
} as const;

export const NDVI_ABSOLUTE_LABELS = {
  low: 'Düşük < 0.30',
  medium: 'Orta 0.30–0.59',
  high: 'Yüksek ≥ 0.60',
} as const;

export type NdviAbsoluteClass = keyof typeof NDVI_ABSOLUTE_COLORS;

export function ndviAbsoluteClass(value: number): NdviAbsoluteClass {
  if (value < NDVI_LOW_MAX) return 'low';
  if (value < NDVI_HIGH_MIN) return 'medium';
  return 'high';
}

export function ndviAbsoluteRgb(value: number) {
  return NDVI_ABSOLUTE_RGB[ndviAbsoluteClass(value)];
}
