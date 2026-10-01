export type RegionalPressureLevel = 'none' | 'watch' | 'elevated' | 'high';

export type RegionalPestDiseaseSignal = {
  threatKey: string;
  commonName: string | null;
  scientificName: string | null;
  threatType: 'disease' | 'pest' | 'unknown';
  observationCount: number;
  verifiedCount: number;
  trustedCount: number;
  sourceCount: number;
  nearestDistanceKm: number | null;
  newestObservedOn: string | null;
  pressureScore: number;
  level: RegionalPressureLevel;
  sourceLabels: string[];
  evidence: string[];
};

export type RegionalPestDiseaseContext = {
  version: '17.0';
  fieldId: string;
  status: 'ready' | 'no_signal' | 'needs_data' | 'unavailable';
  radiusKm: number;
  lookbackDays: number;
  topSignal: RegionalPestDiseaseSignal | null;
  signals: RegionalPestDiseaseSignal[];
  diagnosisAuthority: false;
  chemicalPrescriptionAuthority: false;
  generatedAt: string;
  sourceModel: 'regional-observation-aggregate-v17';
  missingInputs: string[];
  guardrails: {
    nearbyObservationIsNotFieldPresence: true;
    regionalPressureIsNotProbability: true;
    noChemicalPrescriptionFromRegionalSignal: true;
    rawObservationCoordinatesAreNotExposed: true;
  };
};
