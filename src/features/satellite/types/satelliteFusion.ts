export type SatelliteFusionTrendDirection =
  | 'rising'
  | 'stable'
  | 'falling'
  | 'unknown';

export type SatelliteFusionSeriesPoint = {
  date: string;
  mean: number;
  min: number | null;
  max: number | null;
};

export type SatelliteFusionTrend = {
  direction: SatelliteFusionTrendDirection;
  latest: number | null;
  previous: number | null;
  delta: number | null;
  slopePerDay: number | null;
  count: number;
};

export type SatelliteFusionSignal = {
  series: SatelliteFusionSeriesPoint[];
  trend: SatelliteFusionTrend;
};

export type ActiveProductionValidation = {
  status:
    | 'active_growth_supported'
    | 'active_growth_possible'
    | 'low_vegetation_signal'
    | 'season_closed'
    | 'unknown'
    | string;
  confidence?: 'high' | 'medium' | 'low' | string | null;
  headline?: string | null;
  summary?: string | null;
  evidence?: string[] | null;
  open_season?: boolean | null;
  harvest_date?: string | null;
  metrics?: {
    latest_ndvi?: number | null;
    optical_sample_count?: number | null;
    radar_sample_count?: number | null;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
};

export type SatelliteFusionResponse = {
  success: true;
  source: {
    optical: string;
    radar: string;
  };
  period: {
    from: string;
    to: string;
  };
  optical: {
    ndvi: SatelliteFusionSignal;
  };
  radar: {
    vvDb: SatelliteFusionSignal;
    vhDb: SatelliteFusionSignal;
    vvMinusVhDb: SatelliteFusionSignal;
  };
  fusion: {
    status: 'stable' | 'watch' | 'attention' | 'unknown';
    summary: string;
    evidence: string[];
    caution: string;
  };
  activeProduction: ActiveProductionValidation | null;
  generatedAt: string;
};

export type SatelliteFusionErrorResponse = {
  success?: false;
  error?: string;
  message?: string;
};
