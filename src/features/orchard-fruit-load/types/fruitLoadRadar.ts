import type { OrchardTreeLoadLevel } from '../../orchard/types/orchardTree';

export type FruitLoadRadarLevel = OrchardTreeLoadLevel;

export type FruitLoadDistribution = {
  none: number;
  low: number;
  medium: number;
  high: number;
  very_high: number;
  unknown: number;
};

export type FruitLoadRadarSnapshot = {
  fieldId: string;
  crop: string;
  status: 'not_applicable' | 'empty' | 'insufficient' | 'ready';
  level: FruitLoadRadarLevel;
  treeCount: number;
  observedTreeCount: number;
  fruitContextTreeCount: number;
  distribution: FruitLoadDistribution;
  measuredFruitCountTreeCount: number;
  measuredFruitCountSum: number | null;
  measuredFruitCountMean: number | null;
  measuredFruitCountMin: number | null;
  measuredFruitCountMax: number | null;
  sampleCoveragePct: number;
  projectedFruitCount: number | null;
  projectionEligible: boolean;
  projectionReason: string;
  measuredYieldTreeCount: number;
  stressTreeCount: number;
  waterStressTreeCount: number;
  alternancePossible: boolean;
  evidence: string[];
  warnings: string[];
  generatedAt: string;
};
