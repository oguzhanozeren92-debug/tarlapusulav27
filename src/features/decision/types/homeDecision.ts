import type { IrrigationDecisionResult } from '../../irrigation/types/irrigationDecision';
import type { PhenologyResult } from '../../phenology/types/phenology';
import type { FieldOperation } from '../../field-operations/types/fieldOperation';
import type { HomeNutrientSignal } from '../../nutrition/types/homeNutrientSignal';
import type { HomeSatelliteTrendSignal } from '../../satellite/types/homeSatelliteSignals';
import type { HomeNdviAnomalySignal } from '../../satellite/types/homeSatelliteSignals';
import type { FieldDataBackboneSnapshot } from '../../data-backbone/types/fieldDataBackbone';
import type { EarthSearchNdviStats } from '../../home-map/services/earthSearchNdvi.service';

export type HomeDecisionTarget = 'home' | 'weather' | 'spray_weather' | 'calendar' | 'ai' | 'irrigation_detail' | 'soil' | 'map_vegetation' | 'field_growth' | 'inventory' | 'terrain';
export type HomeDecisionSource =
  | 'field' | 'weather' | 'calendar' | 'satellite' | 'pusula' | 'risk-radar' | 'multi-stress'
  | 'irrigation' | 'phenology' | 'operation' | 'nutrition' | 'weed-intelligence' | 'yield-harvest' | 'orchard-tree' | 'storage-risk' | 'irrigation-economics' | 'frost-pocket' | 'field-workability' | 'irrigation-distribution' | 'water-scarcity' | 'microclimate-sensor';
export type HomeTodayIconKey = 'water' | 'rain' | 'document' | 'leaf-green' | 'leaf-gold';
export type HomeDecisionConfidence = 'strong' | 'medium' | 'preliminary';
/** Kaynak adaptörünün sağladığı veri durumu; olay kimliği gözlem tarihi değildir. */
export type HomeDecisionSignalStatus = 'ready' | 'partial' | 'needs-data' | 'error';
export type HomeDecisionSignal = {
  status?: HomeDecisionSignalStatus;
  observedAt?: string | null;
  /** Kaynağın kendi güncellik kuralı. Gateway tarımsal bir eşik uydurmaz. */
  maxAgeHours?: number | null;
};
export type HomeDecisionKind = 'do' | 'avoid' | 'check' | 'upcoming' | 'data';
export type HomeDecisionMissingInfoKind =
  | 'irrigation-status'
  | 'irrigation-method'
  | 'last-irrigation'
  | 'season-profile'
  | 'soil-analysis';
export type HomePhenologySignal = Pick<
  PhenologyResult,
  'stage' | 'stageLabel' | 'dataStatus' | 'warnings' | 'confidence' | 'basis' | 'summary'
>;
export type HomeIrrigationDecisionSignal = IrrigationDecisionResult;
export type HomeFieldOperationSignal = FieldOperation;
export type HomeQuickDecision = { title?: string; detail?: string; tone?: string };
export type HomeObservationFollowUpSignal = {
  pointId: string;
  direction: string | null;
  areaGeometry?: unknown;
  latestSatelliteDate: string | null;
  nextPhotoDueAt: string | null;
  comparisonStatus: 'improving' | 'stable' | 'worsening' | 'unknown' | null;
  comparisonSummary: string | null;
  comparedAt: string | null;
  trackedIssueLabel?: string | null;
  trackedIssueStatus?: 'improving' | 'stable' | 'worsening' | 'not_visible' | 'uncertain' | null;
  trackedIssueSummary?: string | null;
  dueForPhoto: boolean;
};

export type HomeDecisionTask = { taskKey: string; actionTarget: string; rewardPoints: number; rewardRuleKey?: string | null; metadata?: Record<string, unknown> };
export type HomeDecisionEvent = {
  signal?: HomeDecisionSignal;
  id: string; group: string; source: HomeDecisionSource; priority: number; severity: 'info' | 'warning' | 'danger'; target: HomeDecisionTarget;
  channels: Array<'today' | 'notification' | 'pusula'>; label: string; title: string; detail: string; evidence?: string[]; confidence?: HomeDecisionConfidence; sourceModel?: string; kind?: HomeDecisionKind; missingInfoKind?: HomeDecisionMissingInfoKind; task?: HomeDecisionTask;
  today?: { tone: string; visual: 'irrigation' | 'spraying'; iconKey: HomeTodayIconKey; iconClass: 'leaf' | 'water' };
  notification?: { iconKey: 'leaf' | 'rain' | 'document'; iconTone: 'green' | 'cyan' | 'gold'; dotTone: 'info' | 'warning' | 'danger' };
};
export type HomeTodayDecision = {
  id: string; group: string; priority: number; label: string; title: string; detail: string; tone: string;
  visual: 'irrigation' | 'spraying'; iconSrc: string; iconClass: 'leaf' | 'water'; target: HomeDecisionTarget;
  fieldId?: string | null; source?: HomeDecisionSource; evidence?: string[]; confidence?: HomeDecisionConfidence; kind?: HomeDecisionKind; missingInfoKind?: HomeDecisionMissingInfoKind; task?: HomeDecisionTask;
};
export type HomeSystemNotification = { id: string; priority: number; severity: 'info' | 'warning' | 'danger'; source: HomeDecisionSource; title: string; detail: string; iconKey: 'leaf' | 'rain' | 'document'; iconTone: 'green' | 'cyan' | 'gold'; dotTone: 'info' | 'warning' | 'danger'; target: HomeDecisionTarget; task?: HomeDecisionTask };

export type HomeDecisionEngineInput = {
  fieldKey: string; now?: Date; activeHomeLayer?: string; weatherStatus?: string | null; hasUsableTodayWeather?: boolean;
  quickTemperatureMin?: number | null; quickTemperature?: number | null; quickWindKmh?: number | null; quickRainChance?: number | null; quickRainMm?: number | null;
  nextCalendarItem?: any | null; fieldSynthesis?: any; homePusulaResult?: any; homeNdviStats?: EarthSearchNdviStats | null; irrigationDecision?: HomeIrrigationDecisionSignal | null; irrigationLoading?: boolean; irrigationError?: string | null;
  nutrient?: HomeNutrientSignal | null; satelliteTrend?: HomeSatelliteTrendSignal | null; satelliteAnomaly?: HomeNdviAnomalySignal | null;
  phenology?: HomePhenologySignal | null; phenologyTimeSeriesStatus?: 'idle' | 'loading' | 'ready' | 'error'; irrigationQuick?: HomeQuickDecision | null; sprayingQuick?: HomeQuickDecision | null;
  hourlySprayWindow?: boolean; hourlySprayNextWindow?: { from: number; to: number; label: string } | null; hourlySprayForecastReady?: boolean; hourlySprayRisk?: { at: number; detail: string } | null;
  resolvedHomeSatelliteDate?: string; homeFieldId?: string | number | null; homeFieldCrop?: string | null; recentFieldOperations?: HomeFieldOperationSignal[];
  observationFollowUp?: HomeObservationFollowUpSignal | null;
  dataBackbone?: FieldDataBackboneSnapshot | null;
};
