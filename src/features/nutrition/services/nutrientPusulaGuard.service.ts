import type { FieldSynthesisResult } from '../../../services/unifiedMapAiService';
import type { NutrientProductionDecisionGuardResult } from './nutrientProductionDecisionGuard.service';

export type NutrientPusulaGuardSnapshot = {
  version: '14.6';
  applied: boolean;
  blockedNitrogenClaim: boolean;
  fieldId: string | null;
  authorityModel: string | null;
  alternativeCauses: string[];
  recentFertilizationDate: string | null;
  phenologyStage: string | null;
  zoning: {
    status: 'ready_for_sampling' | 'partial' | 'needs_data';
    confidence: 'low' | 'medium' | 'high';
    samplingAllowed: boolean;
    candidateAreas: string[];
    variableRateNitrogenAllowed: false;
    runtimeAvailable: false;
  };
  localBiophysics: {
    sl2pAvailable: boolean;
    quality: 'high' | 'medium' | 'low' | 'unknown' | null;
    acquiredAt: string | null;
    laiTrend: 'up' | 'down' | 'stable' | 'unknown' | null;
    cccTrend: 'up' | 'down' | 'stable' | 'unknown' | null;
    cwcTrend: 'up' | 'down' | 'stable' | 'unknown' | null;
  };
  generatedAt: string | null;
};

export type GuardedFieldSynthesis = FieldSynthesisResult & {
  nutrientGuard?: NutrientPusulaGuardSnapshot | null;
};

const NITROGEN_WORD = /\b(?:azot|nitrojen|nitrogen|\bn\b)\b/i;
const DEFICIENCY_WORD = /(?:eksik|eksiklik|dusuk|düşük|yetersiz|noksan|deficien|uygula|uygulama|gubre|gübre|fertiliz|doz|kg\s*\/?\s*(?:da|ha))/i;

function text(value: unknown, max = 1200) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function compact(values: Array<string | null | undefined>, limit = 10) {
  return [...new Set(values.map((value) => text(value)).filter(Boolean))].slice(0, limit);
}

function containsNitrogenClaim(value: unknown) {
  const normalized = text(value, 1600)
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i');

  return NITROGEN_WORD.test(normalized) && DEFICIENCY_WORD.test(normalized);
}

function guardMatchesField(
  fieldId: unknown,
  guard: NutrientProductionDecisionGuardResult | null | undefined,
) {
  if (!guard) return false;
  const requested = text(fieldId, 120);
  return !requested || !guard.fieldId || requested === text(guard.fieldId, 120);
}

function authorityModel(guard: NutrientProductionDecisionGuardResult) {
  return text(guard.event?.sourceModel, 240) || null;
}

function snapshot(
  guard: NutrientProductionDecisionGuardResult,
): NutrientPusulaGuardSnapshot {
  return {
    version: '14.6',
    applied: true,
    blockedNitrogenClaim: guard.blockedNitrogenClaim,
    fieldId: text(guard.fieldId, 120) || null,
    authorityModel: authorityModel(guard),
    alternativeCauses: [...guard.alternativeCauseLabels],
    recentFertilizationDate: guard.recentFertilization.date,
    phenologyStage:
      guard.phenologyContext.stageLabel ?? guard.phenologyContext.stage ?? null,
    zoning: {
      status: guard.zoningReadiness.status,
      confidence: guard.zoningReadiness.confidence,
      samplingAllowed: guard.zoningReadiness.samplingPlan.allowed,
      candidateAreas: guard.zoningReadiness.samplingPlan.candidates.map(
        (candidate) => candidate.area,
      ),
      variableRateNitrogenAllowed:
        guard.zoningReadiness.prescriptionGate.variableRateNitrogenAllowed,
      runtimeAvailable: guard.zoningReadiness.prescriptionGate.runtimeAvailable,
    },
    localBiophysics: {
      sl2pAvailable: guard.localNutrientContext.sl2pAvailable,
      quality: guard.localNutrientContext.biophysicsQuality,
      acquiredAt: guard.localNutrientContext.acquiredAt,
      laiTrend: guard.localNutrientContext.laiTrend,
      cccTrend: guard.localNutrientContext.cccTrend,
      cwcTrend: guard.localNutrientContext.cwcTrend,
    },
    generatedAt: guard.generatedAt ?? null,
  };
}

function guardEvidence(guard: NutrientProductionDecisionGuardResult) {
  const recent = guard.recentFertilization;
  const phenology = guard.phenologyContext;

  return compact([
    guard.blockedNitrogenClaim
      ? 'Azotla ilgili uygulama yorumu, laboratuvar/saha doğrulaması yetersiz olduğu için kullanıcıya kesin öneri olarak geçirilmedi.'
      : guard.mergedDifferential
        ? 'Besin kararı, negatif bitki örtüsü sinyali için neden-ayırma filtresinden geçirildi.'
        : null,
    recent.present
      ? `Son kayıtlı gübreleme: ${recent.date ?? 'tarih belirtilmedi'}${
          recent.productName ? ` · ${recent.productName}` : ''
        }.`
      : null,
    phenology.usable
      ? `Fenoloji bağlamı: ${phenology.stageLabel || phenology.stage}.`
      : null,
    guard.alternativeCauseLabels.length
      ? `Alternatif stres kanıtları: ${guard.alternativeCauseLabels.join(' · ')}.`
      : null,
    guard.zoningReadiness.samplingPlan.allowed
      ? `Gerçek Sentinel-2 göreli bölgelerinden örnekleme hedefleri: ${guard.zoningReadiness.samplingPlan.candidates.map((candidate) => candidate.area).join(' · ')}. Bunlar gübre reçete zonu değildir.`
      : null,
    'Variable-rate N reçetesi; kalibre edilmiş yerel runtime, zon-spesifik ölçüm ve prescription-grade geometri olmadan kapalıdır.',
    ...guard.evidence,
  ], 8);
}

function safeBlockedHeadline(guard: NutrientProductionDecisionGuardResult) {
  return (
    text(guard.event?.title, 220) ||
    'Besin kararını uygulamadan önce nedeni doğrula'
  );
}

function safeBlockedSummary(guard: NutrientProductionDecisionGuardResult) {
  const alternatives = guard.alternativeCauseLabels.length
    ? ` Önce ${guard.alternativeCauseLabels.join(', ')} yönündeki kanıtları ayır.`
    : ' Önce saha fotoğrafı, su durumu ve güncel laboratuvar kanıtıyla nedeni ayır.';

  return (
    'Bitki örtüsü düşüşü azot nedeni olarak doğrulanmadı.' +
    alternatives
  );
}

function safeBlockedAction(guard: NutrientProductionDecisionGuardResult) {
  const recent = guard.recentFertilization;
  const recentText =
    recent.present && recent.ageDays != null && recent.ageDays <= 21
      ? ' Yakın tarihli gübreleme kaydı olduğu için aynı besini tekrar uygulamadan önce saha yanıtını kontrol et.'
      : '';

  return (
    'Yeni N gübresi ekleme kararı vermeden önce nedeni saha kontrolü/fotoğraf ve uygun laboratuvar kanıtıyla doğrula.' +
    recentText
  );
}

function guardedCaution(
  existing: unknown,
  guard: NutrientProductionDecisionGuardResult,
) {
  return compact([
    text(existing),
    guard.blockedNitrogenClaim
      ? '14.6: Pusula görünümünde düşük NDVI azot eksikliği veya gübre zonu olarak sunulmaz; N yorumu doğrulanana kadar uygulama önerisi bloke kalır.'
      : guard.mergedDifferential
        ? '14.6: Pusula, besin yorumunda NDVI sinyalini tek başına azot kanıtı veya variable-rate zonu saymaz.'
        : null,
    guard.zoningReadiness.samplingPlan.allowed
      ? `Örnekleme hedefleri ${guard.zoningReadiness.samplingPlan.candidates.map((candidate) => candidate.area).join(' · ')}; bunlar yalnız saha/lab doğrulaması içindir.`
      : null,
    'Sayısal gübre dozu veya variable-rate reçete bu doğrulama/zonal readiness katmanından üretilmez.',
  ], 4).join(' ');
}

function filteredLikelyCauses(
  synthesis: FieldSynthesisResult,
  guard: NutrientProductionDecisionGuardResult,
) {
  if (!guard.blockedNitrogenClaim) return synthesis.likelyCauses ?? [];

  return (synthesis.likelyCauses ?? []).filter((cause) => {
    return !containsNitrogenClaim(
      `${cause?.title ?? ''} ${cause?.reason ?? ''}`,
    );
  });
}

function filteredEvidence(
  synthesis: FieldSynthesisResult,
  guard: NutrientProductionDecisionGuardResult,
) {
  const existing = Array.isArray(synthesis.evidence) ? synthesis.evidence : [];
  const safeExisting = guard.blockedNitrogenClaim
    ? existing.filter((item) => !containsNitrogenClaim(item?.finding))
    : existing;

  const guardLayer = {
    layer: 'soil' as const,
    layerLabel: 'Toprak & Besin · Doğrulama',
    finding: guardEvidence(guard).slice(0, 3).join(' '),
    status: guard.blockedNitrogenClaim ? ('kontrol' as const) : ('normal' as const),
  };

  if (!guardLayer.finding) return safeExisting.slice(0, 10);
  return [guardLayer, ...safeExisting].slice(0, 10);
}

/**
 * 14.6 — Pusula field-synthesis son kullanıcı kapısı.
 *
 * Bu fonksiyon yeni bir besin kararı üretmez. Home karar motorunda çalışan
 * 14.2 production guard sonucunu Pusula görünümüne uygular. Böylece backend
 * sentezi azotla ilgili iddialı bir cümle üretmiş olsa bile kullanıcıya
 * gösterilmeden önce aynı kanonik güvenlik kapısından geçer.
 */
export function applyNutrientGuardToFieldSynthesis(
  synthesis: FieldSynthesisResult | null | undefined,
  guard: NutrientProductionDecisionGuardResult | null | undefined,
): GuardedFieldSynthesis | null {
  if (!synthesis) return null;
  if (!guard) return synthesis as GuardedFieldSynthesis;
  const guardHasPurpose = Boolean(
    guard.event ||
    guard.blockedNitrogenClaim ||
    guard.zoningReadiness.samplingPlan.allowed
  );
  if (!guardHasPurpose || !guardMatchesField(guard.fieldId, guard)) {
    return synthesis as GuardedFieldSynthesis;
  }

  const blocked = guard.blockedNitrogenClaim;
  const headline =
    blocked && containsNitrogenClaim(synthesis.headline)
      ? safeBlockedHeadline(guard)
      : synthesis.headline;
  const summary =
    blocked && containsNitrogenClaim(synthesis.summary)
      ? safeBlockedSummary(guard)
      : synthesis.summary;
  const action =
    blocked && containsNitrogenClaim(synthesis.action)
      ? safeBlockedAction(guard)
      : synthesis.action;

  const importantArea = synthesis.importantArea
    ? {
        ...synthesis.importantArea,
        summary:
          blocked && containsNitrogenClaim(synthesis.importantArea.summary)
            ? 'Bu alandaki bitki örtüsü farkının nedeni henüz doğrulanmadı; azot dahil tek bir nedene bağlama.'
            : synthesis.importantArea.summary,
        evidence: Array.isArray(synthesis.importantArea.evidence)
          ? blocked
            ? synthesis.importantArea.evidence.filter(
                (item) => !containsNitrogenClaim(item),
              )
            : synthesis.importantArea.evidence
          : synthesis.importantArea.evidence,
      }
    : null;

  return {
    ...synthesis,
    headline,
    summary,
    action,
    caution: guardedCaution(synthesis.caution, guard),
    likelyCauses: filteredLikelyCauses(synthesis, guard),
    evidence: filteredEvidence(synthesis, guard),
    importantArea,
    model: `${text(synthesis.model, 220) || 'pusula-field-synthesis'}+nutrition-guard-v14.6`,
    nutrientGuard: snapshot(guard),
  };
}

function sanitizeReasons(
  values: unknown,
  guard: NutrientProductionDecisionGuardResult,
) {
  const reasons = Array.isArray(values) ? values.map((item) => text(item)) : [];
  return guard.blockedNitrogenClaim
    ? reasons.filter((item) => !containsNitrogenClaim(item))
    : reasons;
}

/**
 * Aktif harita katmanı Pusula yorumunu da aynı kapıdan geçirir. Bu özellikle
 * vegetation/NDVI ekranında ham AI yorumunun "azot eksikliği" diye kesinleşip
 * field-synthesis guardını by-pass etmesini engeller.
 */
export function applyNutrientGuardToMapResult<T = any>(
  result: T | null | undefined,
  guard: NutrientProductionDecisionGuardResult | null | undefined,
): T | null {
  if (!result) return null;
  if (!guard) return result as T;
  const guardHasPurpose = Boolean(
    guard.event ||
    guard.blockedNitrogenClaim ||
    guard.zoningReadiness.samplingPlan.allowed
  );
  if (!guardHasPurpose) return result as T;

  const raw = result as any;
  const analysis = raw.analysis ?? null;
  if (!analysis) {
    return {
      ...raw,
      nutrientGuard: snapshot(guard),
    } as T;
  }

  const blocked = guard.blockedNitrogenClaim;
  const nextAnalysis = {
    ...analysis,
    headline:
      blocked && containsNitrogenClaim(analysis.headline)
        ? safeBlockedHeadline(guard)
        : analysis.headline,
    summary:
      blocked && containsNitrogenClaim(analysis.summary)
        ? safeBlockedSummary(guard)
        : analysis.summary,
    action:
      blocked && containsNitrogenClaim(analysis.action)
        ? safeBlockedAction(guard)
        : analysis.action,
    reasons: sanitizeReasons(analysis.reasons, guard),
    caution: guardedCaution(analysis.caution, guard),
    importantArea: analysis.importantArea
      ? {
          ...analysis.importantArea,
          summary:
            blocked && containsNitrogenClaim(analysis.importantArea.summary)
              ? 'Bu alandaki bitki örtüsü farkının nedeni henüz doğrulanmadı; tek başına azota bağlama.'
              : analysis.importantArea.summary,
          evidence: Array.isArray(analysis.importantArea.evidence)
            ? blocked
              ? analysis.importantArea.evidence.filter(
                  (item: unknown) => !containsNitrogenClaim(item),
                )
              : analysis.importantArea.evidence
            : analysis.importantArea.evidence,
        }
      : analysis.importantArea,
  };

  return {
    ...raw,
    analysis: nextAnalysis,
    nutrientGuard: snapshot(guard),
  } as T;
}

export function compactNutrientGuardForPusula(
  guard: NutrientProductionDecisionGuardResult | null | undefined,
) {
  const guardHasPurpose = Boolean(
    guard && (
      guard.event ||
      guard.blockedNitrogenClaim ||
      guard.zoningReadiness.samplingPlan.allowed
    ),
  );
  if (!guard || !guardHasPurpose) return null;

  return {
    version: '14.6' as const,
    blockedNitrogenClaim: guard.blockedNitrogenClaim,
    mergedDifferential: guard.mergedDifferential,
    authorityModel: authorityModel(guard),
    event: guard.event
      ? {
          title: guard.event.title,
          detail: guard.event.detail,
          confidence: guard.event.confidence,
          severity: guard.event.severity,
        }
      : null,
    recentFertilization: guard.recentFertilization,
    phenologyContext: guard.phenologyContext,
    alternativeCauseLabels: [...guard.alternativeCauseLabels],
    localNutrientContext: guard.localNutrientContext,
    zoningReadiness: {
      status: guard.zoningReadiness.status,
      confidence: guard.zoningReadiness.confidence,
      spatialSignal: guard.zoningReadiness.spatialSignal,
      samplingPlan: guard.zoningReadiness.samplingPlan,
      prescriptionGate: guard.zoningReadiness.prescriptionGate,
    },
    evidence: guardEvidence(guard),
    guardrails: {
      soilNutritionEngineRemainsAuthority: true as const,
      ndviAloneCannotDiagnoseNitrogen: true as const,
      noNumericDoseFromGuard: true as const,
      samplingTargetIsNotPrescriptionZone: true as const,
      noVariableRateNitrogenWithoutRuntime: true as const,
    },
  };
}
