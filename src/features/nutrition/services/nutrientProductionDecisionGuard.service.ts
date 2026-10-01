import type { HomeDecisionEvent, HomePhenologySignal } from '../../decision/types/homeDecision';
import type { FieldOperation } from '../../field-operations/types/fieldOperation';
import type { HomeNutrientSignal } from './buildNutrientDecision';
import type { NutrientDifferentialDiagnosisResult } from './nutrientDifferentialDiagnosis.service';
import type { LocalNutrientContextResult } from './localNutrientContext.service';
import type { EarthSearchNdviStats } from '../../home-map/services/earthSearchNdvi.service';
import {
  buildNutrientZoningReadiness,
  type NutrientZoningReadinessResult,
} from './nutrientZoningReadiness.service';

export type NutrientProductionDecisionGuardInput = {
  fieldId: string | number | null | undefined;
  crop?: string | null;
  authoritativeEvent: HomeDecisionEvent | null | undefined;
  differential: NutrientDifferentialDiagnosisResult | null | undefined;
  differentialEvent?: HomeDecisionEvent | null;
  nutrient?: HomeNutrientSignal | null;
  ndviStats?: EarthSearchNdviStats | null;
  phenology?: HomePhenologySignal | null;
  recentOperations?: FieldOperation[] | null;
  photoFollowUpDue?: boolean;
  now?: Date;
};

export type NutrientProductionDecisionGuardResult = {
  version: '14.6';
  fieldId: string;
  crop: string | null;
  event: HomeDecisionEvent | null;
  mergedDifferential: boolean;
  blockedNitrogenClaim: boolean;
  nitrogenSpecificAuthorityText: boolean;
  recentFertilization: {
    present: boolean;
    date: string | null;
    ageDays: number | null;
    productName: string | null;
  };
  phenologyContext: {
    usable: boolean;
    stage: string | null;
    stageLabel: string | null;
  };
  alternativeCauseLabels: string[];
  zoningReadiness: NutrientZoningReadinessResult;
  localNutrientContext: {
    version: '14.5' | null;
    status: 'ready' | 'partial' | 'needs_data' | null;
    sl2pAvailable: boolean;
    biophysicsQuality: 'high' | 'medium' | 'low' | 'unknown' | null;
    acquiredAt: string | null;
    laiTrend: 'up' | 'down' | 'stable' | 'unknown' | null;
    cccTrend: 'up' | 'down' | 'stable' | 'unknown' | null;
    cwcTrend: 'up' | 'down' | 'stable' | 'unknown' | null;
    methodReferenceOnly: true;
    runtimeMethodCount: number;
    pysticsRuntimeStatus: 'unconfigured' | 'ready' | 'unreachable' | 'incompatible' | null;
    pysticsPackageVersion: string | null;
    pysticsTurkeyWheatProfileValidated: boolean;
    pysticsShadowRunAllowed: boolean;
  };
  evidence: string[];
  guardrails: {
    soilNutritionEngineRemainsAuthority: true;
    differentialFilterCannotCreateDose: true;
    ndviCannotPromoteNitrogenClaim: true;
    recentFertilizationMustBeVisible: true;
    phenologyIsContextNotDoseAuthority: true;
    alternativeStressMustBeVisible: true;
    biophysicsCannotDiagnoseNitrogen: true;
    methodReferencesCannotActAsRuntime: true;
    samplingZoneCannotBecomePrescriptionZone: true;
    variableRateNitrogenRequiresCalibratedRuntime: true;
  };
  generatedAt: string;
};

function text(value: unknown, max = 700) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalize(value: unknown) {
  return text(value, 1200)
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i');
}

function compact(values: Array<string | null | undefined>, limit = 10) {
  return [...new Set(values.map((item) => text(item)).filter(Boolean))].slice(0, limit);
}

function localNutrientContext(
  nutrient: HomeNutrientSignal | null | undefined,
): LocalNutrientContextResult | null {
  return (nutrient as (HomeNutrientSignal & { localContext?: LocalNutrientContextResult | null }) | null | undefined)
    ?.localContext ?? null;
}

function compactLocalNutrientContext(
  nutrient: HomeNutrientSignal | null | undefined,
): NutrientProductionDecisionGuardResult['localNutrientContext'] {
  const local = localNutrientContext(nutrient);
  return {
    version: local?.version ?? null,
    status: local?.status ?? null,
    sl2pAvailable: local?.biophysics.available === true,
    biophysicsQuality: local?.biophysics.quality ?? null,
    acquiredAt: local?.biophysics.acquiredAt ?? null,
    laiTrend: local?.biophysics.lai.trend ?? null,
    cccTrend: local?.biophysics.ccc.trend ?? null,
    cwcTrend: local?.biophysics.cwc.trend ?? null,
    methodReferenceOnly: true,
    runtimeMethodCount: local?.pysticsRuntime.runtimeAvailable ? 1 : 0,
    pysticsRuntimeStatus: local?.pysticsRuntime.status ?? null,
    pysticsPackageVersion: local?.pysticsRuntime.packageVersion ?? null,
    pysticsTurkeyWheatProfileValidated:
      local?.pysticsRuntime.turkeyWheat.configuredProfileValidated === true,
    pysticsShadowRunAllowed:
      local?.pysticsRuntime.turkeyWheat.productionRunAllowed === true,
  };
}

function fieldMatches(operation: FieldOperation, fieldId: string) {
  return !fieldId || !operation.fieldId || String(operation.fieldId) === fieldId;
}

function isFertilizationOperation(operation: FieldOperation) {
  const type = normalize(operation.type);
  const title = normalize(operation.title);
  return (
    type === 'gubreleme' ||
    type.includes('gubre') ||
    title.includes('gubre') ||
    type.includes('fertiliz') ||
    title.includes('fertiliz')
  );
}

function dateAgeDays(dateValue: string | null | undefined, now: Date) {
  if (!dateValue) return null;
  const parsed = Date.parse(`${dateValue.slice(0, 10)}T12:00:00`);
  if (!Number.isFinite(parsed)) return null;
  const diff = Math.floor((now.getTime() - parsed) / 86_400_000);
  return diff >= 0 ? diff : null;
}

function latestFertilization(
  operations: FieldOperation[] | null | undefined,
  fieldId: string,
  now: Date,
) {
  const candidates = (operations ?? [])
    .filter((operation) => fieldMatches(operation, fieldId))
    .filter(isFertilizationOperation)
    .map((operation) => ({ operation, ageDays: dateAgeDays(operation.date, now) }))
    .filter((item) => item.ageDays != null)
    .sort((a, b) => (a.ageDays ?? Number.MAX_SAFE_INTEGER) - (b.ageDays ?? Number.MAX_SAFE_INTEGER));

  const latest = candidates[0] ?? null;
  return {
    present: Boolean(latest),
    date: latest?.operation.date ?? null,
    ageDays: latest?.ageDays ?? null,
    productName: latest?.operation.productName ?? null,
  };
}

function phenologyContext(phenology: HomePhenologySignal | null | undefined) {
  const stage = text(phenology?.stage, 80) || null;
  const stageLabel = text(phenology?.stageLabel, 120) || null;
  const usable = Boolean(
    phenology?.dataStatus === 'usable' &&
      stage &&
      !['unknown', 'pre_sowing', 'post_harvest', 'dormancy'].includes(stage),
  );
  return { usable, stage, stageLabel };
}

function isNitrogenSpecific(
  event: HomeDecisionEvent,
  nutrient: HomeNutrientSignal | null | undefined,
) {
  const server = nutrient?.soilIntelligence?.serverDecision ?? null;
  const haystack = compact([
    event.title,
    event.detail,
    ...(event.evidence ?? []),
    server?.headline,
    server?.summary,
    server?.action,
  ], 30)
    .map(normalize)
    .join(' | ');

  return (
    haystack.includes('azot') ||
    haystack.includes('nitrojen') ||
    haystack.includes('nitrogen') ||
    /(^|[^a-z])n\s*(eksik|dusuk|yetersiz|noksan)/i.test(haystack)
  );
}

function alternativeCauseLabels(
  differential: NutrientDifferentialDiagnosisResult | null | undefined,
) {
  if (!differential?.triggered) return [];
  return differential.causes
    .filter((cause) => cause.key !== 'nitrogen')
    .filter((cause) => cause.strength === 'strong' || cause.strength === 'moderate')
    .map((cause) => cause.label)
    .filter(Boolean);
}

function contextEvidence(input: {
  nutrient?: HomeNutrientSignal | null;
  ndviStats?: EarthSearchNdviStats | null;
  phenology: ReturnType<typeof phenologyContext>;
  fertilization: ReturnType<typeof latestFertilization>;
  alternatives: string[];
  differential?: NutrientDifferentialDiagnosisResult | null;
}) {
  const laboratoryAuthority = input.nutrient?.soilIntelligence?.laboratoryAuthority === true;
  const local = localNutrientContext(input.nutrient);
  const recent = input.fertilization;
  const recentText = recent.present
    ? `Son kayıtlı gübreleme ${recent.ageDays === 0 ? 'bugün' : `${recent.ageDays} gün önce`}${recent.productName ? ` (${recent.productName})` : ''}.`
    : null;

  return compact([
    laboratoryAuthority
      ? 'Seçili tarlaya ait laboratuvar kaydı besin kararının ölçüm dayanağıdır.'
      : null,
    input.phenology.usable
      ? `Güncel fenoloji bağlamı: ${input.phenology.stageLabel || input.phenology.stage}. Fenoloji doz otoritesi değildir.`
      : null,
    recentText,
    input.alternatives.length
      ? `Aynı bitki örtüsü sinyalinde alternatif stres kanıtları: ${input.alternatives.join(' · ')}.`
      : null,
    input.differential?.triggered
      ? 'Negatif NDVI/bitki örtüsü sinyali Besin Yanlış Teşhis Filtresinden geçirildi; uydu sinyali tek başına azot kanıtı sayılmadı.'
      : null,
    local?.biophysics.available
      ? `SL2P biyofizik desteği hazır${local.biophysics.acquiredAt ? ` · ${local.biophysics.acquiredAt.slice(0, 10)}` : ''}; LAI/CCC/CWC yalnız destek bağlamıdır ve azot teşhisi değildir.`
      : null,
    local?.biophysics.ccc.significant && local.biophysics.ccc.trend === 'down'
      ? 'CCC/klorofil trendinde belirgin düşüş var; bu durum tek başına azot eksikliği olarak yorumlanmadı.'
      : null,
    local?.pysticsRuntime.runtimeAvailable
      ? `pySTICS ${local.pysticsRuntime.packageVersion ?? ''} worker hazır; yalnız shadow crop-model desteğidir.${local.pysticsRuntime.turkeyWheat.productionRunAllowed ? ' Doğrulanmış Türkiye buğdayı kalibrasyon profili var.' : ' Türkiye buğdayı production kalibrasyon kapısı kapalı.'}`
      : local
        ? 'pySTICS worker hazır değil; model sonucu varmış gibi karar zincirine eklenmez.'
        : null,
    local
      ? 'Resmî STICS/ICAR/HaFAS yöntem referansları production gübre reçetesi değildir; pySTICS worker da soil-nutrition-engine otoritesini devralamaz.'
      : null,
  ], 10);
}

function mergeChannels(
  first: HomeDecisionEvent['channels'],
  second: HomeDecisionEvent['channels'] | undefined,
) {
  return [...new Set([...(first ?? []), ...(second ?? [])])];
}

function mergedTask(
  authority: HomeDecisionEvent,
  differentialEvent: HomeDecisionEvent | null | undefined,
  photoFollowUpDue: boolean,
): HomeDecisionEvent['task'] {
  if (authority.task) {
    return {
      ...authority.task,
      metadata: {
        ...(authority.task.metadata ?? {}),
        nutrientDifferentialMerged: Boolean(differentialEvent),
        photoFollowUpAlreadyDue: photoFollowUpDue,
        ...(differentialEvent?.task
          ? {
              secondaryActionTarget: differentialEvent.task.actionTarget,
              secondaryTaskKey: differentialEvent.task.taskKey,
              requestFieldPhoto: true,
            }
          : {}),
      },
    };
  }

  if (photoFollowUpDue) return undefined;
  return differentialEvent?.task;
}

function guardedSourceModel(value: string | null | undefined) {
  let model = text(value, 260) || 'soil-nutrition-engine';
  if (!model.includes('nutrition-differential')) {
    model = `${model}+nutrition-differential-filter-v14.2`;
  }
  if (!model.includes('nutrient-zoning-readiness')) {
    model = `${model}+nutrient-zoning-readiness-v14.6`;
  }
  return model;
}

/**
 * 14.6 — Production besin kararının önündeki kanonik doğrulama + zonlama readiness kapısı.
 *
 * - soil-nutrition-engine kararı ve otoritesi korunur.
 * - Filtre yeni gübre dozu veya ikinci bir besin kararı üretmez.
 * - NDVI düşüşü N eksikliği için kanıt seviyesini yükseltemez.
 * - Son gübreleme, fenoloji ve alternatif stres kanıtları tek kullanıcı olayında görünür.
 * - Gerçek NDVI göreli bölgeleri yalnız örnekleme hedefi olabilir; prescription zonu olamaz.
 */
export function guardNutrientProductionDecision(
  input: NutrientProductionDecisionGuardInput,
): NutrientProductionDecisionGuardResult {
  const now = input.now ?? new Date();
  const fieldId = text(input.fieldId, 100);
  const crop = text(input.crop, 120) || null;
  const event = input.authoritativeEvent ?? null;
  const differential = input.differential ?? null;
  const fertilization = latestFertilization(input.recentOperations, fieldId, now);
  const phenology = phenologyContext(input.phenology);
  const alternatives = alternativeCauseLabels(differential);
  const localContext = localNutrientContext(input.nutrient);
  const zoningReadiness = buildNutrientZoningReadiness({
    fieldId,
    crop,
    ndviStats: input.ndviStats ?? null,
    localContext,
    differential,
    now,
  });
  const evidence = compact([
    ...contextEvidence({
      nutrient: input.nutrient,
      phenology,
      fertilization,
      alternatives,
      differential,
    }),
    ...zoningReadiness.evidence.slice(0, 4),
  ], 12);

  const base: Omit<NutrientProductionDecisionGuardResult, 'event' | 'mergedDifferential' | 'blockedNitrogenClaim' | 'nitrogenSpecificAuthorityText'> = {
    version: '14.6',
    fieldId,
    crop,
    recentFertilization: fertilization,
    phenologyContext: phenology,
    alternativeCauseLabels: alternatives,
    zoningReadiness,
    localNutrientContext: compactLocalNutrientContext(input.nutrient),
    evidence,
    guardrails: {
      soilNutritionEngineRemainsAuthority: true,
      differentialFilterCannotCreateDose: true,
      ndviCannotPromoteNitrogenClaim: true,
      recentFertilizationMustBeVisible: true,
      phenologyIsContextNotDoseAuthority: true,
      alternativeStressMustBeVisible: true,
      biophysicsCannotDiagnoseNitrogen: true,
      methodReferencesCannotActAsRuntime: true,
      samplingZoneCannotBecomePrescriptionZone: true,
      variableRateNitrogenRequiresCalibratedRuntime: true,
    },
    generatedAt: now.toISOString(),
  };

  if (!event) {
    const diagnosticNitrogenBlock = Boolean(
      differential?.triggered && differential?.nitrogenGate?.recommendationBlocked,
    );
    return {
      ...base,
      event: null,
      mergedDifferential: Boolean(differential?.triggered),
      blockedNitrogenClaim: diagnosticNitrogenBlock,
      nitrogenSpecificAuthorityText: false,
    };
  }

  const nitrogenSpecific = isNitrogenSpecific(event, input.nutrient);
  const differentialTriggered = Boolean(differential?.triggered);
  const nitrogenBlocked = Boolean(
    differentialTriggered &&
      nitrogenSpecific &&
      differential?.nitrogenGate?.recommendationBlocked,
  );

  const commonEvidence = compact([
    ...(event.evidence ?? []),
    ...evidence,
    ...(differentialTriggered ? differential?.evidence ?? [] : []),
  ], 12);

  if (!differentialTriggered) {
    return {
      ...base,
      event: {
        ...event,
        sourceModel: guardedSourceModel(event.sourceModel),
        evidence: commonEvidence,
      },
      mergedDifferential: false,
      blockedNitrogenClaim: false,
      nitrogenSpecificAuthorityText: nitrogenSpecific,
    };
  }

  const differentialEvent = input.differentialEvent ?? null;
  const latestFertilizationCaution = fertilization.present && (fertilization.ageDays ?? 999) <= 21
    ? 'Yakın tarihli gübreleme kaydı da var; aynı besini tekrar uygulamadan önce mevcut uygulamanın saha yanıtını doğrula.'
    : '';

  if (nitrogenBlocked) {
    const alternativeText = alternatives.length
      ? `Önce ${alternatives.join(', ')} yönündeki kanıtları ayır.`
      : 'Önce saha fotoğrafı, su durumu ve güncel laboratuvar kanıtıyla nedeni ayır.';

    return {
      ...base,
      event: {
        ...event,
        id: `nutrition:${fieldId || 'field'}:guarded-nitrogen:${differential?.trigger.observedAt?.slice(0, 10) || 'current'}`,
        group: 'nutrition',
        source: 'nutrition',
        sourceModel: guardedSourceModel(event.sourceModel),
        confidence: 'preliminary',
        kind: 'check',
        priority: Math.max(event.priority ?? 0, differentialEvent?.priority ?? 0, 94),
        severity: 'warning',
        channels: mergeChannels(event.channels, differentialEvent?.channels),
        label: 'TOPRAK & BESİN',
        title: 'Azot kararını uygulamadan önce nedeni doğrula',
        detail: compact([
          'Toprak & Besin Motorundaki azotla ilgili yorum, NDVI düşüşü nedeniyle otomatik uygulama talimatına çevrilmedi.',
          differential?.nitrogenGate?.reason,
          alternativeText,
          latestFertilizationCaution,
        ], 5).join(' '),
        evidence: compact([
          ...commonEvidence,
          '14.2 güvenlik kapısı: azot yorumu doğrulanana kadar yeni N uygulama önerisi kullanıcı olayında bloke edildi.',
        ], 12),
        task: mergedTask(event, differentialEvent, Boolean(input.photoFollowUpDue)),
        today: event.today ?? differentialEvent?.today,
        notification: event.notification ?? differentialEvent?.notification,
      },
      mergedDifferential: true,
      blockedNitrogenClaim: true,
      nitrogenSpecificAuthorityText: true,
    };
  }

  const contextualDetail = differential?.nitrogenGate?.nitrogenInterpretationAllowed
    ? 'Laboratuvar azot bulgusu mevcut olsa da NDVI düşüşü tek neden olarak azota atanmadı; alternatif stres kanıtları birlikte tutuldu.'
    : 'Besin kararı korunuyor; aynı dönemdeki NDVI düşüşü bu kararın nedeni olarak otomatik atanmadı.';

  return {
    ...base,
    event: {
      ...event,
      group: 'nutrition',
      source: 'nutrition',
      sourceModel: guardedSourceModel(event.sourceModel),
      priority: Math.max(event.priority ?? 0, differentialEvent?.priority ?? 0),
      channels: mergeChannels(event.channels, differentialEvent?.channels),
      detail: compact([
        event.detail,
        contextualDetail,
        alternatives.length ? `Alternatif stres: ${alternatives.join(' · ')}.` : null,
        latestFertilizationCaution,
      ], 5).join(' '),
      evidence: commonEvidence,
      task: mergedTask(event, differentialEvent, Boolean(input.photoFollowUpDue)),
      today: event.today ?? differentialEvent?.today,
      notification: event.notification ?? differentialEvent?.notification,
    },
    mergedDifferential: true,
    blockedNitrogenClaim: false,
    nitrogenSpecificAuthorityText: nitrogenSpecific,
  };
}
