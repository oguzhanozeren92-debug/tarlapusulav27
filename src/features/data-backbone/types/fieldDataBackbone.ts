export type FieldDataMutation = 'saved' | 'updated' | 'deleted' | 'snapshot';

export type FieldDataSourceClass = 'user' | 'recorded' | 'system' | 'model';

/**
 * Veri omurgasının alan adı serbest bırakılmıştır. Böylece yeni bir motor
 * eklendiğinde şema değiştirmeden aynı olay defterine bağlanabiliriz.
 */
export type FieldDataDomain =
  | 'operation'
  | 'observation'
  | 'field_profile'
  | 'season'
  | 'soil'
  | 'weather'
  | 'satellite'
  | 'phenology'
  | 'irrigation'
  | 'nutrition'
  | 'plant_protection'
  | 'yield'
  | 'cost'
  | 'model'
  | string;

export type FieldDataEvent = {
  id: string;
  userId: string;
  fieldId: string;
  domain: FieldDataDomain;
  eventType: string;
  mutation: FieldDataMutation;
  source: string;
  sourceClass: FieldDataSourceClass;
  sourceTable: string | null;
  sourceRecordId: string | null;
  changedFields: string[];
  payload: Record<string, unknown>;
  occurredOn: string | null;
  observedAt: string | null;
  createdAt: string;
};

export type PublishUserFieldDataEventInput = {
  fieldId: string;
  domain: FieldDataDomain;
  eventType: string;
  source: string;
  changedFields?: string[];
  payload?: Record<string, unknown>;
  occurredOn?: string | null;
  observedAt?: string | null;
};

export type FieldDataBackboneSnapshot = {
  fieldId: string;
  generatedAt: string;
  eventCount: number;
  changedFields: string[];
  latestByDomain: Record<string, FieldDataEvent>;
  events: FieldDataEvent[];
};
