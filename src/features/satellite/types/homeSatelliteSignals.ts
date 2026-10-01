import type { NdviAnomalyResult } from './ndviAnomaly';

/** Home karar motorunun zaman serisi eğiliminden beklediği salt sözleşme. */
export type HomeSatelliteTrendSignal = {
  fieldId: string;
  status: 'idle' | 'loading' | 'ready' | 'error';
  quality: 'usable' | 'insufficient';
  direction: 'rising' | 'stable' | 'falling' | 'unknown';
  observationCount: number;
  spanDays: number | null;
  latestDate: string | null;
};

/** Home karar motorunun NDVI anomali katmanından beklediği salt sözleşme. */
export type HomeNdviAnomalySignal = NdviAnomalyResult & {
  fieldId: string;
  status: 'idle' | 'loading' | 'ready' | 'error';
};
