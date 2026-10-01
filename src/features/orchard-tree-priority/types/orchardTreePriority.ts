export type OrchardTreePriorityBand = 'urgent' | 'priority' | 'follow' | 'baseline';

export type OrchardTreePriorityReasonCode =
  | 'high_stress'
  | 'medium_stress'
  | 'water_stress'
  | 'water_watch'
  | 'stale_observation'
  | 'no_observation'
  | 'low_fruit_load'
  | 'alternance';

export type OrchardTreePriorityReason = {
  code: OrchardTreePriorityReasonCode;
  label: string;
  detail: string;
};

export type OrchardTreePriorityItem = {
  treeId: string;
  treeCode: string;
  variety: string | null;
  rowNo: string | null;
  latestObservationAt: string | null;
  daysSinceObservation: number | null;
  band: OrchardTreePriorityBand;
  score: number;
  reasons: OrchardTreePriorityReason[];
};

export type OrchardTreePrioritySnapshot = {
  status: 'no_trees' | 'no_observations' | 'ready';
  totalTreeCount: number;
  observedTreeCount: number;
  urgentCount: number;
  priorityCount: number;
  followCount: number;
  baselineCount: number;
  topTrees: OrchardTreePriorityItem[];
  headline: string;
  summary: string;
  generatedAt: string;
};
