import { supabase } from '../../../supabaseClient';
import type {
  IrrigationDecisionCode,
  IrrigationDecisionConfidence,
  IrrigationDecisionDay,
  IrrigationDecisionResult,
} from '../types/irrigationDecision';

type WaterHubDecision = {
  status: 'ready' | 'needs_data' | 'not_applicable';
  decision_status:
    | 'not_applicable'
    | 'needs_data'
    | 'monitor'
    | 'threshold_approaching'
    | 'threshold_reached'
    | 'measurement_conflict';
  confidence: 'low' | 'medium' | 'high' | 'unknown';
  headline: string;
  summary: string;
  action: string;
  authority_basis:
    | 'measurement'
    | 'recorded_water_balance'
    | 'not_applicable'
    | 'insufficient';
  current_depletion_mm: number | null;
  stress_threshold_mm: number | null;
  days_to_threshold: number | null;
};

type WaterHubResponse = {
  success: boolean;
  field_id?: string;
  snapshot_id?: string;
  decision?: WaterHubDecision;
  missing_inputs?: string[];
  conflicts?: Array<{ note?: string }>;
  generated_at?: string;
  error?: string;
  message?: string;
};

type WaterSnapshotRow = {
  id: string;
  field_id: string;
  status: string;
  decision_status: string;
  confidence: string;
  headline: string;
  summary: string;
  action: string;
  water_balance: any;
  measurements: any;
  crop_coefficient: any;
  irrigation_history: any;
  supporting_models: any;
  conflicts: any[];
  missing_inputs: string[];
  generated_at: string;
};

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeIrrigationStatus(
  value: unknown,
): IrrigationDecisionResult['irrigationStatus'] {
  const raw = String(value ?? '').trim().toLocaleLowerCase('tr-TR');

  if (
    ['sulu', 'sulanıyor', 'sulaniyor', 'irrigated', 'irrigation', 'tam sulu'].includes(
      raw,
    )
  ) {
    return 'irrigated';
  }

  if (
    ['susuz', 'kuru', 'kıraç', 'kirac', 'rainfed', 'dry'].includes(raw)
  ) {
    return 'rainfed';
  }

  if (
    ['kısmi', 'kismi', 'partial', 'supplemental'].includes(raw) ||
    raw.includes('kısmi') ||
    raw.includes('kismi') ||
    raw.includes('ihtiyaca')
  ) {
    return 'partial';
  }

  return 'unknown';
}

function mapDecision(
  decision: WaterHubDecision,
): IrrigationDecisionCode {
  switch (decision.decision_status) {
    case 'threshold_reached':
      return 'irrigate_now';
    case 'threshold_approaching':
      return 'irrigation_approaching';
    case 'monitor':
      return 'wait';
    case 'measurement_conflict':
      return decision.current_depletion_mm !== null &&
        decision.stress_threshold_mm !== null &&
        decision.current_depletion_mm >= decision.stress_threshold_mm
        ? 'irrigate_now'
        : 'wait';
    case 'not_applicable':
      return 'rainfed_monitoring';
    default:
      return 'needs_data';
  }
}

function mapConfidence(
  value: WaterHubDecision['confidence'],
): IrrigationDecisionConfidence {
  return value === 'high' || value === 'medium' ? value : 'low';
}

function mapForecast(snapshot: WaterSnapshotRow): IrrigationDecisionDay[] {
  const rows =
    snapshot?.water_balance?.recorded_balance?.forecast;

  if (!Array.isArray(rows)) return [];

  return rows
    .map((row: any) => {
      const date = String(row?.date ?? '').trim();
      const cropWaterUse = finite(row?.crop_water_use_mm);
      const precipitation = finite(row?.precipitation_mm);
      const effectiveRain = finite(row?.effective_rain_mm);
      const estimatedDeficit = finite(row?.estimated_depletion_mm);

      if (
        !date ||
        cropWaterUse === null ||
        precipitation === null ||
        effectiveRain === null ||
        estimatedDeficit === null
      ) {
        return null;
      }

      return {
        date,
        estimatedCropWaterUseMm: cropWaterUse,
        precipitationMm: precipitation,
        effectiveRainMm: effectiveRain,
        estimatedDeficitMm: estimatedDeficit,
        thresholdReached: row?.stress_threshold_reached === true,
      } satisfies IrrigationDecisionDay;
    })
    .filter(Boolean) as IrrigationDecisionDay[];
}

function currentKc(snapshot: WaterSnapshotRow) {
  return (
    finite(snapshot?.crop_coefficient?.kc) ??
    finite(snapshot?.crop_coefficient?.current_candidate) ??
    finite(snapshot?.water_balance?.recorded_balance?.crop_coefficient?.kc) ??
    finite(
      snapshot?.water_balance?.measured_root_zone_readiness?.basal_kcb
        ?.current_candidate,
    )
  );
}

function rootStorage(snapshot: WaterSnapshotRow) {
  return (
    finite(
      snapshot?.water_balance?.measured_root_zone_readiness?.root_zone
        ?.total_available_water_mm,
    ) ??
    finite(
      snapshot?.water_balance?.recorded_balance?.root_zone
        ?.total_available_water_mm,
    )
  );
}

function lastIrrigationDate(snapshot: WaterSnapshotRow) {
  const value =
    snapshot?.irrigation_history?.last_irrigation?.last_irrigation_date ??
    snapshot?.water_balance?.recorded_balance?.baseline?.last_irrigation_date;

  return value ? String(value) : null;
}

function lastIrrigationAmount(snapshot: WaterSnapshotRow) {
  return (
    finite(snapshot?.irrigation_history?.last_irrigation?.applied_water_mm) ??
    finite(snapshot?.water_balance?.recorded_balance?.baseline?.applied_water_mm)
  );
}

function warnings(snapshot: WaterSnapshotRow) {
  const list: string[] = [];

  if (
    snapshot?.measurements?.production_measurement_used === true
  ) {
    list.push(
      'Production sulama kararı güncel gerçek kök bölgesi nem ölçümünü model tahmininden öncelikli kullandı.',
    );
  }

  for (const conflict of snapshot?.conflicts ?? []) {
    const note = String(conflict?.note ?? '').trim();
    if (note) list.push(note);
  }

  return [...new Set(list)];
}

function reasons(
  response: WaterHubResponse,
  snapshot: WaterSnapshotRow,
) {
  const rows: string[] = [];
  const basis =
    response.decision?.authority_basis ??
    snapshot?.water_balance?.production_basis;

  if (basis === 'measurement') {
    rows.push('Karar dayanağı: gerçek kök bölgesi toprak nemi ölçümü.');
  } else if (basis === 'recorded_water_balance') {
    rows.push('Karar dayanağı: sulama kaydı + ET₀×Kc + etkili yağış su dengesi.');
  }

  const pyfaoStatus =
    snapshot?.supporting_models?.pyfao56?.status;
  if (pyfaoStatus === 'available') {
    rows.push('pyfao56 sonucu bağımsız shadow doğrulama kanıtı olarak hazır.');
  }

  const aquaStatus =
    snapshot?.supporting_models?.aquacrop?.status;
  if (aquaStatus === 'ready') {
    rows.push('AquaCrop sezon su-verim senaryosu destek kanıtı olarak hazır.');
  }

  return rows.slice(0, 4);
}

export async function loadWaterIntelligenceDecision(
  field: any,
): Promise<IrrigationDecisionResult> {
  const fieldId = String(field?.id ?? '').trim();

  if (!fieldId) {
    throw new Error('Su Zekâsı için tarla kimliği bulunamadı.');
  }

  const { data, error } = await supabase.functions.invoke(
    'analyze-field-intelligence',
    {
      body: {
        mode: 'water',
        field_id: fieldId,
      },
    },
  );

  if (error) {
    throw new Error(
      error.message || 'Su Zekâsı sunucu kararı alınamadı.',
    );
  }

  const response = (data ?? {}) as WaterHubResponse;

  if (!response.success || !response.decision) {
    throw new Error(
      response.message ||
        response.error ||
        'Su Zekâsı geçerli karar döndürmedi.',
    );
  }

  let snapshot: WaterSnapshotRow | null = null;

  if (response.snapshot_id) {
    const snapshotResult = await supabase
      .from('field_water_intelligence_snapshots')
      .select(
        'id,field_id,status,decision_status,confidence,headline,summary,action,water_balance,measurements,crop_coefficient,irrigation_history,supporting_models,conflicts,missing_inputs,generated_at',
      )
      .eq('id', response.snapshot_id)
      .eq('field_id', fieldId)
      .maybeSingle();

    if (!snapshotResult.error) {
      snapshot = snapshotResult.data as WaterSnapshotRow | null;
    }
  }

  if (!snapshot) {
    const latest = await supabase
      .from('field_water_intelligence_snapshots')
      .select(
        'id,field_id,status,decision_status,confidence,headline,summary,action,water_balance,measurements,crop_coefficient,irrigation_history,supporting_models,conflicts,missing_inputs,generated_at',
      )
      .eq('field_id', fieldId)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latest.error || !latest.data) {
      throw new Error(
        latest.error?.message ||
          'Su Zekâsı kararı üretildi fakat karar snapshotı okunamadı.',
      );
    }

    snapshot = latest.data as WaterSnapshotRow;
  }

  const hubDecision = response.decision;
  const decision = mapDecision(hubDecision);
  const irrigationStatus = normalizeIrrigationStatus(
    field?.irrigationStatus ?? field?.irrigation_status,
  );
  const deficit = finite(hubDecision.current_depletion_mm);
  const threshold = finite(hubDecision.stress_threshold_mm);
  const storage = rootStorage(snapshot);
  const forecast = mapForecast(snapshot);

  return {
    fieldId,
    fieldName: field?.name ? String(field.name) : null,
    cropName: field?.crop ? String(field.crop) : null,
    decision,
    confidence: mapConfidence(hubDecision.confidence),
    irrigationStatus,
    irrigationMethod: (field?.irrigationMethod ??
      field?.irrigation_method ??
      'unknown') as IrrigationDecisionResult['irrigationMethod'],
    currentKc: currentKc(snapshot),
    waterBalance: {
      currentDeficitMm: deficit,
      stressThresholdMm: threshold,
      rootZoneStorageMm: storage,
      currentDeficitRatio:
        deficit !== null && storage !== null && storage > 0
          ? deficit / storage
          : null,
      projected5DayDeficitMm:
        forecast.at(-1)?.estimatedDeficitMm ?? null,
      daysToStressThreshold: hubDecision.days_to_threshold,
      lastIrrigationDate: lastIrrigationDate(snapshot),
      lastIrrigationAppliedMm: lastIrrigationAmount(snapshot),
      baselineAssumption:
        hubDecision.authority_basis === 'recorded_water_balance'
          ? 'last_irrigation_refilled_root_zone'
          : null,
    },
    rainfedStress: null,
    recommendation: {
      netWaterMm: null,
      totalNetWaterM3: null,
      irrigationEfficiencyApplied: false,
      grossWaterMm: null,
      totalGrossWaterM3: null,
    },
    forecast,
    display: {
      headline: hubDecision.headline,
      summary: hubDecision.summary,
      action: hubDecision.action,
      waterLabel:
        deficit !== null && threshold !== null
          ? `Su açığı: ${deficit.toFixed(1)} / ${threshold.toFixed(1)} mm`
          : null,
    },
    reasons: reasons(response, snapshot),
    missing:
      Array.isArray(response.missing_inputs) && response.missing_inputs.length
        ? response.missing_inputs
        : Array.isArray(snapshot.missing_inputs)
          ? snapshot.missing_inputs
          : [],
    warnings: warnings(snapshot),
    generatedAt:
      response.generated_at ||
      snapshot.generated_at ||
      new Date().toISOString(),
  };
}
