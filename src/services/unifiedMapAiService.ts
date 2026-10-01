import { supabase } from '../supabaseClient';
import { buildFieldDataBackboneSnapshot } from '../features/data-backbone/services/fieldDataBackbone.service';
import type { FieldDataBackboneSnapshot, FieldDataEvent } from '../features/data-backbone/types/fieldDataBackbone';
import { getFieldPhenologySnapshot } from '../features/phenology/services/fieldPhenologySnapshot.service';
import type { PhenologyResult } from '../features/phenology/types/phenology';
import type { Field } from '../types';
import { loadFieldYieldHarvestQualitySnapshot } from '../features/yield-quality/services/fieldYieldHarvestQuality.service';
import { persistFieldYieldHarvestEvidence } from '../features/yield-quality/services/yieldHarvestEvidence.service';
import { mirrorYieldHarvestEvidenceForPdf } from '../features/pusula-pdf/services/pusulaPdfYieldHarvestEvidence.service';
import type { FieldYieldHarvestQualityLiveSnapshot } from '../features/yield-quality/types/fieldYieldHarvestQuality';
import { formatHarvestQualityMeasurements } from '../features/yield-quality/services/harvestQualityLabel.service';
import { loadOrchardIntelligenceSnapshot } from '../features/orchard/services/orchardIntelligence.service';
import type { OrchardIntelligenceSnapshot } from '../features/orchard/types/orchardTree';
import { compactOrchardChillForPusula, loadOrchardChillSnapshot } from '../features/orchard-chill/services/orchardChill.service';
import type { OrchardChillSnapshot } from '../features/orchard-chill/types/orchardChill';
import { mirrorOrchardEvidenceForPdf } from '../features/pusula-pdf/services/pusulaPdfOrchardEvidence.service';
import { mirrorOrchardChillEvidenceForPdf } from '../features/pusula-pdf/services/pusulaPdfOrchardChillEvidence.service';
import type { CropModeRuntime } from '../features/crop-mode/types/cropMode';
import {
  applyCropModeToFieldSynthesis,
  applyCropModeToMapAnalysis,
} from '../features/crop-mode/services/cropModePusula.service';
import {
  compactRiskRadarForPusula,
  fetchFieldRiskRadar,
  type RiskRadarResult,
} from './riskRadarService';
import { buildRiskRadarDecision } from '../features/decision/services/buildRiskRadarDecision';
import {
  fetchWheatPlantingWindowDecision,
  compactPlantingWindowDecisionForPusula,
} from '../features/planting-window/services/plantingWindowDecision.service';
import type { PlantingWindowDecisionResult } from '../features/planting-window/types/plantingWindow';
import {
  compactCropRotationPlanForPusula,
  loadCropRotationPlan,
} from '../features/crop-rotation/services/cropRotation.service';
import type { CropRotationPlan } from '../features/crop-rotation/types/cropRotation';

export type UnifiedMapActiveLayer =
  | 'vegetation'
  | 'radar-vv'
  | 'radar-vh'
  | 'radar-water'
  | 'soil'
  | 'climate'
  | 'surface-temperature'
  | 'water-demand'
  | 'rain-history'
  | 'frost-risk'
  | 'biodiversity';

export type UnifiedMapAiResult = {
  status: 'normal' | 'dikkat' | 'kontrol';
  headline: string;
  summary: string;
  reasons: string[];
  action: string;
  confidence: 'dusuk' | 'orta' | 'yuksek';
  caution: string;
  importantArea?: {
    area: string;
    summary: string;
    evidence?: string[];
  } | null;
  model?: string;
  memorySaved?: boolean;
  memoryObservationId?: string | null;
  historyUsed?: number;
  memoryError?: string | null;
  fieldDataBackbone?: FieldDataBackboneSnapshot | null;
  fieldMemoryFacts?: string[];
  cropMode?: unknown;
};

export type UnifiedMapAiInput = {
  fieldId: string;
  fieldName?: string;
  crop?: string;
  periodDays: number;
  activeLayer: UnifiedMapActiveLayer;
  activeLayerLabel: string;
  activeLayerContext?: unknown;
  cropMode?: CropModeRuntime | null;
  context: {
    ndvi?: unknown;
    radar?: unknown;
    soil?: unknown;
    climate?: unknown;
    biodiversity?: unknown;
  };
};

export type FieldSynthesisLikelyCause = {
  title: string;
  probability: 'dusuk' | 'orta' | 'yuksek';
  reason: string;
};

export type FieldSynthesisEvidence = {
  layer:
    | UnifiedMapActiveLayer
    | 'phenology'
    | 'risk-radar'
    | 'visual-diagnosis'
    | 'field-memory'
    | 'yield-harvest'
    | 'orchard-tree'
    | 'climate-memory'
    | 'planting-window'
    | 'crop-rotation'
    | 'orchard-chill';
  layerLabel: string;
  finding: string;
  status: 'normal' | 'dikkat' | 'kontrol';
};

export type FieldSynthesisLifecycle = {
  stage: string | null;
  stageLabel: string | null;
  confidence: 'low' | 'medium' | 'high' | null;
  dataStatus: string | null;
  cropCycle: string | null;
  bearing: boolean | null;
  plantingYear: number | null;
  ndviTrend: string | null;
  ndviQuality: string | null;
  climateShiftDays: number;
  climateAnomalyC: number | null;
};

export type FieldSynthesisResult = {
  status: 'normal' | 'dikkat' | 'kontrol';
  headline: string;
  summary: string;
  likelyCauses: FieldSynthesisLikelyCause[];
  evidence: FieldSynthesisEvidence[];
  importantArea: {
    area: string;
    summary: string;
    evidence?: string[];
  } | null;
  action: string;
  caution: string;
  confidence: 'dusuk' | 'orta' | 'yuksek';
  layersUsed: UnifiedMapActiveLayer[];
  missingLayers: UnifiedMapActiveLayer[];
  layerCount: number;
  generatedAt: string;
  model?: string;
  lifecycle?: FieldSynthesisLifecycle | null;
  riskRadar?: ReturnType<typeof compactRiskRadarForPusula> | null;
  visualDiagnosis?: {
    latest: {
      activityId: string;
      source: string;
      provider: string | null;
      model: string | null;
      issueType: string;
      possibleIssue: string;
      confidence: number;
      severity: string;
      status: string;
      headline: string;
      observations: string[];
      recommendations: string[];
      needsMoreEvidence: boolean;
      followUpPhoto: string | null;
      comparison: string | null;
      trend: string | null;
      observedAt: string | null;
      evidenceLevel: 'ai_visual_pre_diagnosis';
    };
    historyCount: number;
  } | null;
  memorySaved?: boolean;
  memoryObservationId?: string | null;
  memoryError?: string | null;
  fieldDataBackbone?: FieldDataBackboneSnapshot | null;
  fieldMemoryFacts?: string[];
  yieldHarvest?: FieldYieldHarvestQualityLiveSnapshot | null;
  orchard?: OrchardIntelligenceSnapshot | null;
  cropMode?: unknown;
  climateMemoryNarrative?: {
    status?: string;
    headline?: string;
    summary?: string;
    evidence?: string[];
    actionContext?: string | null;
    persistenceKey?: string | null;
    changesRiskScore?: false;
  } | null;
  plantingWindowDecision?: ReturnType<typeof compactPlantingWindowDecisionForPusula> | null;
  cropRotationPlan?: ReturnType<typeof compactCropRotationPlanForPusula> | null;
  orchardChill?: ReturnType<typeof compactOrchardChillForPusula> | null;
};

export type FieldSynthesisInput = {
  fieldId: string;
  fieldName?: string;
  crop?: string;
  weatherContext?: unknown;
  climateContext?: unknown;
  phenologyResult?: PhenologyResult | null;
  cropMode?: CropModeRuntime | null;
  lifecycleContext?: {
    cropCycle?: string | null;
    season?: number | null;
    plantingYear?: number | null;
    plantingDate?: string | null;
    harvestDate?: string | null;
    bearing?: boolean | null;
  };
};

function normalizeErrorMessage(value: unknown) {
  if (value instanceof Error && value.message) return value.message;
  if (typeof value === 'string' && value.trim()) return value.trim();
  return 'Pusula harita yorumunu oluşturamadı.';
}

async function readFunctionError(error: any) {
  try {
    const context = error?.context;
    if (context instanceof Response) {
      const text = await context.clone().text();
      if (text) {
        try {
          const parsed = JSON.parse(text);
          if (typeof parsed?.error === 'string' && parsed.error.trim()) {
            return parsed.error.trim();
          }
        } catch {
          return text.slice(0, 500);
        }
      }
    }
  } catch {
    // no-op
  }

  return error?.message || 'Pusula Edge Function çağrısı başarısız oldu.';
}

function uniqueText(items: string[], value: string) {
  if (value && !items.includes(value)) items.push(value);
}

function backboneText(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function backboneEventDate(event: FieldDataEvent) {
  return (
    backboneText(event.occurredOn) ||
    backboneText(event.observedAt).slice(0, 10) ||
    backboneText(event.createdAt).slice(0, 10)
  );
}

function activeBackboneEvents(snapshot: FieldDataBackboneSnapshot | null) {
  if (!snapshot) return [] as FieldDataEvent[];

  const latestByRecord = new Map<string, FieldDataEvent>();
  const anonymous: FieldDataEvent[] = [];

  for (const event of snapshot.events) {
    const key = event.sourceRecordId
      ? `${event.sourceTable ?? event.domain}:${event.sourceRecordId}`
      : '';
    if (!key) {
      if (event.mutation !== 'deleted') anonymous.push(event);
      continue;
    }
    if (!latestByRecord.has(key)) latestByRecord.set(key, event);
  }

  return [...latestByRecord.values(), ...anonymous].filter(
    (event) => event.mutation !== 'deleted',
  );
}

function fieldMemoryFacts(snapshot: FieldDataBackboneSnapshot | null, limit = 5) {
  const events = activeBackboneEvents(snapshot);
  if (!events.length) return [];

  const facts: string[] = [];
  const add = (text: string) => {
    const clean = backboneText(text);
    if (clean && !facts.includes(clean) && facts.length < limit) facts.push(clean);
  };

  for (const event of events) {
    const payload = event.payload ?? {};
    const date = backboneEventDate(event);

    if (event.domain === 'operation' && event.eventType === 'field_operation') {
      const type = backboneText(payload.activityType);
      if (type) add(`Kayıtlı tarla işlemi: ${type}${date ? ` · ${date}` : ''}.`);
      continue;
    }

    if (event.eventType === 'soil_analysis') {
      const status = backboneText(payload.statusLabel || payload.status);
      add(`Bu tarlaya ait toprak analizi kaydı mevcut${status ? ` · ${status}` : ''}.`);
      continue;
    }

    if (event.eventType === 'soil_water_measurement') {
      const value = Number(payload.volumetricWaterContent);
      const from = Number(payload.depthFromCm);
      const to = Number(payload.depthToCm);
      const depth = Number.isFinite(from) && Number.isFinite(to)
        ? ` · ${from}–${to} cm`
        : '';
      add(
        Number.isFinite(value)
          ? `Saha toprak su ölçümü kayıtlı: VWC ${value}${depth}${date ? ` · ${date}` : ''}.`
          : `Saha toprak su ölçümü kaydı mevcut${depth}${date ? ` · ${date}` : ''}.`,
      );
      continue;
    }

    if (event.eventType === 'growth_observation') {
      const stage = backboneText(payload.stage);
      add(`Saha gelişim gözlemi${stage ? `: ${stage}` : ''}${date ? ` · ${date}` : ''}.`);
      continue;
    }

    if (event.eventType === 'field_season') {
      const crop = backboneText(payload.crop);
      const variety = backboneText(payload.varietyName);
      const planting = backboneText(payload.plantingDate);
      add(
        `Sezon kaydı${crop ? `: ${crop}` : ''}${variety ? ` · ${variety}` : ''}${planting ? ` · ekim/dikim ${planting}` : ''}.`,
      );
      continue;
    }

    if (event.eventType === 'field_profile') {
      const crop = backboneText(payload.crop);
      const method = backboneText(payload.irrigationMethod);
      if (crop || method) {
        add(`Tarla profili${crop ? `: ${crop}` : ''}${method ? ` · sulama yöntemi ${method}` : ''}.`);
      }
    }
  }

  return facts.slice(0, limit);
}

function applyBackboneToUnifiedResult(
  result: UnifiedMapAiResult,
  snapshot: FieldDataBackboneSnapshot | null,
): UnifiedMapAiResult {
  const facts = fieldMemoryFacts(snapshot, 4);
  if (!snapshot || !facts.length) {
    return { ...result, fieldDataBackbone: snapshot, fieldMemoryFacts: facts };
  }

  return {
    ...result,
    caution: [
      result.caution,
      `Tarla hafızasında ${snapshot.eventCount} kayıt bulunuyor; kayıtlı saha işlemleri ve ölçümler model tahminlerinden ayrı gerçek bağlam olarak tutulur.`,
    ].filter(Boolean).join(' '),
    fieldDataBackbone: snapshot,
    fieldMemoryFacts: facts,
  };
}

function applyOrchardToUnifiedResult(
  result: UnifiedMapAiResult,
  orchard: OrchardIntelligenceSnapshot | null,
): UnifiedMapAiResult {
  if (!orchard || orchard.status === 'not_applicable' || orchard.treeCount <= 0) {
    return result;
  }

  const observedTreeCount = orchard.observedTreeCount ?? 0;
  const stressCount = orchard.stressTreeCount ?? 0;
  const highStressCount = orchard.highStressTreeCount ?? 0;
  const waterStressCount = orchard.waterStressTreeCount ?? 0;
  const hasAttention = highStressCount > 0 || waterStressCount > 0;

  const treeContext = [
    `Kayıtlı ağaç: ${orchard.treeCount}`,
    `yakın saha/sensör gözlemi: ${observedTreeCount}`,
    stressCount > 0 ? `stres işaretli: ${stressCount}` : '',
    waterStressCount > 0 ? `su stresi kaydı: ${waterStressCount}` : '',
  ].filter(Boolean).join(' · ');

  const orchardReason = hasAttention
    ? `Ağaç katmanındaki gerçek saha/sensör kayıtlarında ${highStressCount > 0 ? `${highStressCount} yüksek stres` : ''}${highStressCount > 0 && waterStressCount > 0 ? ' ve ' : ''}${waterStressCount > 0 ? `${waterStressCount} su stresi` : ''} kaydı var.`
    : `Ağaç katmanı bağlamı: ${treeContext}.`;

  const reasons = Array.isArray(result.reasons) ? [...result.reasons] : [];
  if (!reasons.includes(orchardReason)) reasons.push(orchardReason);

  const summaryAddition = hasAttention
    ? `Ağaç katmanında gerçek saha/sensör gözlemlerine dayalı dikkat kaydı bulunuyor (${treeContext}).`
    : `Ağaç katmanı ayrıca izleniyor (${treeContext}).`;

  return {
    ...result,
    status: hasAttention && result.status === 'normal' ? 'dikkat' : result.status,
    summary: `${result.summary} ${summaryAddition}`.trim(),
    reasons: reasons.slice(0, 8),
    action: hasAttention
      ? `Stres işaretli kayıtlı ağaçları yakındaki normal kayıtlı ağaçlarla sahada karşılaştır. ${result.action}`.trim()
      : result.action,
    caution: [
      result.caution,
      "Ağaç katmanındaki tek-ağaç durumu yalnız kayıtlı GPS ağacı ve gerçek saha/sensör gözleminden gelir; Sentinel-2 tek ağacın stresini, çiçeğini veya meyvesini kanıtlamaz. Asymetree, SAMSON, FruitMeasure ve MangoSense bu sürümde yöntem referansıdır; canlı otomatik ağaç teşhis runtime'ı değildir.",
    ].filter(Boolean).join(' '),
  };
}

function applyBackboneToFieldSynthesis(
  synthesis: FieldSynthesisResult,
  snapshot: FieldDataBackboneSnapshot | null,
): FieldSynthesisResult {
  const facts = fieldMemoryFacts(snapshot, 5);
  if (!snapshot || !facts.length) {
    return { ...synthesis, fieldDataBackbone: snapshot, fieldMemoryFacts: facts };
  }

  const evidence = [
    {
      layer: 'field-memory' as const,
      layerLabel: 'Tarla Hafızası',
      finding: facts.slice(0, 3).join(' '),
      status: 'normal' as const,
    },
    ...(Array.isArray(synthesis.evidence) ? synthesis.evidence : []),
  ].slice(0, 10);

  const genericNoData = /henüz kayıtlı harita gözlemi yok|henüz yeterli veri yok/i.test(
    `${synthesis.headline} ${synthesis.summary}`,
  );

  return {
    ...synthesis,
    summary: genericNoData
      ? `Tarla hafızasında ${snapshot.eventCount} kayıt mevcut. Harita gözlemi sınırlı olsa da kayıtlı saha işlemleri, sezon ve ölçüm bilgileri değerlendirme bağlamına eklendi. ${synthesis.summary}`
      : synthesis.summary,
    evidence,
    caution: [
      synthesis.caution,
      'Tarla hafızasındaki kullanıcı/laboratuvar/ölçüm kayıtları model tahminlerinden ayrı tutulur; kayıt olmayan ölçüm veya uygulama varmış gibi tamamlanmaz.',
    ].filter(Boolean).join(' '),
    fieldDataBackbone: snapshot,
    fieldMemoryFacts: facts,
  };
}

async function getBackboneSnapshot(fieldId: string) {
  try {
    return await buildFieldDataBackboneSnapshot(fieldId, 140);
  } catch (error) {
    console.warn('[Pusula] tarla veri omurgası bağlanamadı:', error);
    return null;
  }
}

function yieldKgDa(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed / 10 : null;
}

function formatYieldKgDa(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return `${Math.round(parsed).toLocaleString('tr-TR')} kg/da`;
}

function formatYieldDate(value: unknown) {
  const raw = String(value ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function yieldTrendText(value: unknown) {
  const trend = String(value ?? '').toLowerCase();
  if (trend === 'rising') return 'artış eğiliminde';
  if (trend === 'falling') return 'düşüş eğiliminde';
  if (trend === 'stable') return 'dengeli';
  return 'geçmiş veri sınırlı';
}

function applyYieldHarvestToFieldSynthesis(
  synthesis: FieldSynthesisResult,
  live: FieldYieldHarvestQualityLiveSnapshot | null,
): FieldSynthesisResult {
  if (!live) return { ...synthesis, yieldHarvest: null };

  const snapshot = live.snapshot;
  const currentKgDa = yieldKgDa(snapshot.observed.yieldKgHa);
  const averageKgDa = yieldKgDa(snapshot.history.averageYieldKgHa);
  const forecast = snapshot.ensemble?.forecast ?? null;
  const timing = snapshot.ensemble?.harvestTiming ?? null;
  const evidenceParts: string[] = [];

  if (currentKgDa !== null) {
    evidenceParts.push(`Gerçek verim ${formatYieldKgDa(currentKgDa)}`);
  } else if (snapshot.observed.yieldKg !== null) {
    evidenceParts.push(`Gerçek toplam verim ${Math.round(snapshot.observed.yieldKg).toLocaleString('tr-TR')} kg`);
  } else if (forecast?.status === 'model_supported') {
    const lower = yieldKgDa(forecast.lowerKgHa);
    const upper = yieldKgDa(forecast.upperKgHa);
    const central = yieldKgDa(forecast.centralKgHa);
    if (lower !== null && upper !== null) {
      evidenceParts.push(`buğday verim kanıt zarfı ${formatYieldKgDa(lower)}–${formatYieldKgDa(upper)}`);
    } else if (central !== null) {
      evidenceParts.push(`buğday model merkez kanıtı ${formatYieldKgDa(central)}`);
    }
  }

  if (averageKgDa !== null) evidenceParts.push(`geçmiş ortalama ${formatYieldKgDa(averageKgDa)}`);

  if (snapshot.harvest.actualDate) {
    evidenceParts.push(`hasat ${formatYieldDate(snapshot.harvest.actualDate) ?? snapshot.harvest.actualDate}`);
  } else if (timing?.lowerDate && timing?.upperDate) {
    evidenceParts.push(`hasat penceresi ${formatYieldDate(timing.lowerDate) ?? timing.lowerDate}–${formatYieldDate(timing.upperDate) ?? timing.upperDate}`);
  } else if (snapshot.status === 'harvest_window') {
    const days = Number(snapshot.harvest.daysToExpectedHarvest);
    evidenceParts.push(Number.isFinite(days) && days > 0 ? `hasada yaklaşık ${Math.round(days)} gün` : 'hasat penceresi');
  } else if (snapshot.harvest.expectedDate) {
    evidenceParts.push(`beklenen hasat ${formatYieldDate(snapshot.harvest.expectedDate) ?? snapshot.harvest.expectedDate}`);
  }

  const qualityTexts = formatHarvestQualityMeasurements(snapshot.quality.measurements);
  if (qualityTexts.length) evidenceParts.push(`gerçek kalite ölçümü ${qualityTexts.join(' · ')}`);

  const evidence = Array.isArray(synthesis.evidence) ? [...synthesis.evidence] : [];
  if (evidenceParts.length) {
    evidence.unshift({
      layer: 'yield-harvest',
      layerLabel: 'Verim · Hasat · Kalite',
      finding: `${evidenceParts.join(' · ')}.`,
      status: snapshot.status === 'harvest_window' ? 'dikkat' : 'normal',
    });
  }

  let summary = synthesis.summary;
  let action = synthesis.action;

  if (snapshot.observed.yieldKg !== null) {
    const observedText = currentKgDa !== null
      ? formatYieldKgDa(currentKgDa)
      : `${Math.round(snapshot.observed.yieldKg).toLocaleString('tr-TR')} kg toplam`;
    summary = `Kayıtlı gerçek verim ${observedText}; bu kayıt tüm destek model tahminlerinin üstünde tutuluyor. ${summary}`;
  } else if (forecast?.status === 'model_supported') {
    const lower = yieldKgDa(forecast.lowerKgHa);
    const upper = yieldKgDa(forecast.upperKgHa);
    const central = yieldKgDa(forecast.centralKgHa);
    const forecastText = lower !== null && upper !== null
      ? `${formatYieldKgDa(lower)}–${formatYieldKgDa(upper)}`
      : central !== null ? formatYieldKgDa(central) : null;
    if (forecastText) {
      summary = `Buğday için ${forecastText} verim kanıt zarfı var; bu istatistiksel güven aralığı değil ve gerçek hasat kaydı geldiğinde geri planda kalacak. ${summary}`;
    }
  }

  if (snapshot.status === 'harvest_window') {
    const days = Number(snapshot.harvest.daysToExpectedHarvest);
    const timingText = Number.isFinite(days) && days > 0 ? `yaklaşık ${Math.round(days)} gün içinde` : 'mevcut dönemde';
    action = `Hasat olgunluğunu sahada doğrula; ${timingText} hasat penceresi değerlendiriliyor. ${action}`;
  } else if (snapshot.status === 'harvested' && snapshot.harvest.actualDate) {
    summary = `${formatYieldDate(snapshot.harvest.actualDate) ?? snapshot.harvest.actualDate} tarihinde gerçek hasat kaydı mevcut. ${summary}`;
  }

  const caution = [
    synthesis.caution,
    snapshot.quality.status === 'not_measured'
      ? 'Ürün kalite ölçümü girilmediği için Pusula kalite puanı, şeker/protein veya kalite sınıfı uydurmaz.'
      : 'Kalite bilgisi yalnız kayıtlı kullanıcı/laboratuvar ölçümünden gelir; model bu ölçümü değiştirmez.',
    forecast?.status === 'model_supported'
      ? forecast.uncertaintyNote
      : '',
    snapshot.ensemble?.methodReferences?.length
      ? 'YIELD4CAST, QualiTree ve PROSAIL bu aşamada yöntem referansıdır; canlı TarlaPusula runtime çıktısı değildir.'
      : '',
    averageKgDa !== null
      ? `Geçmiş verim eğilimi ${yieldTrendText(snapshot.history.trend)}; geçmiş kayıtlar güncel gerçek verimin yerine geçmez.`
      : '',
  ].filter(Boolean).join(' ');

  return {
    ...synthesis,
    summary,
    action,
    caution,
    evidence: evidence.slice(0, 10),
    yieldHarvest: live,
  };
}

async function getYieldHarvestSnapshot(
  input: FieldSynthesisInput,
): Promise<FieldYieldHarvestQualityLiveSnapshot | null> {
  try {
    const nowYear = new Date().getUTCFullYear();
    const field = {
      id: input.fieldId,
      name: input.fieldName ?? 'Tarla',
      ada: 0,
      parsel: 0,
      area: 0,
      crop: input.crop ?? '',
      season: input.lifecycleContext?.season ?? nowYear,
      status: 'good',
      cropCycle: input.lifecycleContext?.cropCycle === 'perennial' ? 'perennial' : 'annual',
      plantingYear: input.lifecycleContext?.plantingYear ?? null,
      bearing: input.lifecycleContext?.bearing ?? null,
    } satisfies Field;

    const live = await loadFieldYieldHarvestQualitySnapshot(field);

    void persistFieldYieldHarvestEvidence(live)
      .then((evidence) => mirrorYieldHarvestEvidenceForPdf(evidence))
      .catch((error) => {
        console.warn('[Pusula] verim/hasat ortak kanıtı yazılamadı:', error);
      });

    return live;
  } catch (error) {
    console.warn('[Pusula] verim/hasat bağlamı alınamadı:', error);
    return null;
  }
}


function applyOrchardToFieldSynthesis(
  synthesis: FieldSynthesisResult,
  orchard: OrchardIntelligenceSnapshot | null,
): FieldSynthesisResult {
  if (!orchard?.pilotEnabled || orchard.treeCount === 0) {
    return { ...synthesis, orchard: orchard ?? null };
  }

  const evidence: FieldSynthesisEvidence[] = [
    {
      layer: 'orchard-tree',
      layerLabel: 'Ağaç Bazlı Pusula',
      finding: `${orchard.treeCount} kayıtlı ağacın ${orchard.observedTreeCount} tanesinde gerçek saha/sensör gözlemi var; ${orchard.geolocatedTreeCount} ağaç haritada konumlu.`,
      status: orchard.status === 'attention' ? 'dikkat' : 'normal',
    },
    ...(Array.isArray(synthesis.evidence) ? synthesis.evidence : []),
  ];

  let status = synthesis.status;
  let action = synthesis.action;
  const likelyCauses = Array.isArray(synthesis.likelyCauses) ? [...synthesis.likelyCauses] : [];

  if (orchard.highStressTreeCount > 0 || orchard.waterStressTreeCount > 0) {
    if (status === 'normal') status = 'dikkat';
    likelyCauses.unshift({
      title: 'Gerçek ağaç gözleminde stres',
      probability: 'yuksek',
      reason: `${orchard.highStressTreeCount} ağaçta yüksek stres, ${orchard.waterStressTreeCount} ağaçta su stresi kaydı var. Bu ağaç-level saha/sensör kanıtıdır; uydu teşhisi değildir.`,
    });
    action = `Önce stres kaydı bulunan ağaçları ve yakın komşularını karşılaştırmalı kontrol et. ${action}`;
  } else if (orchard.alternance.status === 'possible') {
    likelyCauses.unshift({
      title: 'Olası alternans örüntüsü',
      probability: 'orta',
      reason: `${orchard.alternance.possibleTreeIds.length} ağaçta en az üç yıllık gerçek ağaç verimi dönüşümlü yük örüntüsü gösteriyor; bu teşhis değil takip sinyalidir.`,
    });
  }

  return {
    ...synthesis,
    status,
    action,
    likelyCauses: likelyCauses.slice(0, 5),
    evidence: evidence.slice(0, 10),
    caution: [
      synthesis.caution,
      'Sentinel-2 parsel bağlamı tek ağacın stres, çiçek veya meyve durumunu kanıtlamaz; ağaç durumu yalnız kayıtlı ağaç kimliği ve gerçek saha/sensör gözlemiyle güncellenir.',
      'Asymetree, SAMSON, FruitMeasure ve MangoSense bu sürümde yöntem referansıdır; canlı TarlaPusula runtime çıktısı değildir.',
    ].filter(Boolean).join(' '),
    orchard,
  };
}

async function getOrchardSnapshot(input: FieldSynthesisInput) {
  try {
    const snapshot = await loadOrchardIntelligenceSnapshot(input.fieldId, input.crop ?? '');
    if (snapshot.pilotEnabled && snapshot.treeCount > 0) {
      void mirrorOrchardEvidenceForPdf(snapshot).catch((error) => {
        console.warn('[Pusula] ağaç bazlı kanıt PDF arşivine yazılamadı:', error);
      });
    }
    return snapshot;
  } catch (error) {
    console.warn('[Pusula] ağaç/bahçe bağlamı alınamadı:', error);
    return null;
  }
}

async function getOrchardChillSnapshot(input: FieldSynthesisInput) {
  try {
    const snapshot = await loadOrchardChillSnapshot(input.fieldId);
    void mirrorOrchardChillEvidenceForPdf(snapshot).catch((error) => {
      console.warn('[ORCHARD-CHILL] PDF kanıt aynalama başarısız:', error);
    });
    return snapshot;
  } catch (error) {
    console.warn('[Pusula] meyve soğuklama bağlamı alınamadı:', error);
    return null;
  }
}

function applyOrchardChillToFieldSynthesis(
  synthesis: FieldSynthesisResult,
  snapshot: OrchardChillSnapshot | null,
): FieldSynthesisResult {
  const compact = compactOrchardChillForPusula(snapshot);
  if (!snapshot || !compact || snapshot.status === 'not_applicable') {
    return { ...synthesis, orchardChill: compact };
  }

  const classic = snapshot.localMetrics?.classicHours;
  const station = snapshot.officialReference.stationName;
  const finding = classic === null || classic === undefined
    ? `Meyve soğuklama dönemi ${snapshot.windowStart}–${snapshot.windowEnd}; tarla-noktası saatlik seri tamamlanamadı.`
    : `Tarla koordinatında MGM BİSİP Klasik Yöntemiyle ${classic.toLocaleString('tr-TR')} soğuklama saati hesaplandı${station ? `; MGM istasyon referansı ${station}` : ''}.`;

  const evidence: FieldSynthesisEvidence[] = [
    {
      layer: 'orchard-chill',
      layerLabel: 'Meyve Soğuklama · MGM BİSİP',
      finding,
      status: snapshot.status === 'ready' ? 'normal' : 'kontrol',
    },
    ...(Array.isArray(synthesis.evidence) ? synthesis.evidence : []),
  ].slice(0, 10);

  return {
    ...synthesis,
    evidence,
    summary: synthesis.summary.includes('soğuklama') ? synthesis.summary : `${synthesis.summary} ${finding}`.trim(),
    caution: [
      synthesis.caution,
      'TarlaPusula soğuklama saati tarla koordinatındaki saatlik sıcaklık serisinden MGM BİSİP Klasik Yöntemiyle hesaplanır; resmî MGM istasyon sonucu değildir. Çeşidin doğrulanmış ihtiyaç değeri yoksa tamamlanma yüzdesi veya kalan saat üretilmez.',
    ].filter(Boolean).join(' '),
    orchardChill: compact,
  };
}

function applyPhenologyToFieldSynthesis(
  synthesis: FieldSynthesisResult,
  snapshot: any,
): FieldSynthesisResult {
  if (!snapshot?.phenology) return synthesis;

  const phenology = snapshot.phenology;
  const context = snapshot.context ?? {};
  const ndvi = snapshot.ndvi ?? {};
  const climateShift = snapshot.climateShift ?? {};

  const lifecycle: FieldSynthesisLifecycle = {
    stage: phenology.stage ?? null,
    stageLabel: phenology.stageLabel ?? null,
    confidence: phenology.confidence ?? null,
    dataStatus: phenology.dataStatus ?? null,
    cropCycle: context.cropCycle ?? null,
    bearing: typeof context.bearing === 'boolean' ? context.bearing : null,
    plantingYear: Number.isFinite(Number(context.plantingYear))
      ? Number(context.plantingYear)
      : null,
    ndviTrend: ndvi.direction ?? null,
    ndviQuality: ndvi.quality ?? null,
    climateShiftDays: Number(climateShift.shiftDays ?? 0),
    climateAnomalyC: Number.isFinite(Number(climateShift.anomalyC))
      ? Number(climateShift.anomalyC)
      : null,
  };

  if (
    phenology.dataStatus !== 'usable' ||
    !phenology.stage ||
    phenology.stage === 'unknown'
  ) {
    return {
      ...synthesis,
      lifecycle,
    };
  }

  const evidence = Array.isArray(synthesis.evidence)
    ? [...synthesis.evidence]
    : [];

  evidence.unshift({
    layer: 'phenology',
    layerLabel: 'Fenoloji',
    finding: `${phenology.stageLabel}${
      climateShift.status === 'ready' && climateShift.shiftDays
        ? ` · ERA5 takvim düzeltmesi ${climateShift.shiftDays > 0 ? '+' : ''}${climateShift.shiftDays} gün`
        : ''
    }.`,
    status: 'normal',
  });

  let result: FieldSynthesisResult = {
    ...synthesis,
    evidence: evidence.slice(0, 8),
    lifecycle,
  };

  const crop = context.cropName ?? 'Ürün';
  const stage = String(phenology.stage);
  const stageLabel = String(phenology.stageLabel ?? 'Fenolojik dönem');

  if (
    context.cropCycle === 'perennial' &&
    context.bearing === false &&
    ['flowering', 'fruit_set', 'fruit_growth', 'maturation', 'harvest_window'].includes(stage)
  ) {
    const reasons = [
      `Üretim durumu: ${crop} henüz ürün vermiyor olarak kayıtlı.`,
      `Takvim evresi: ${stageLabel}.`,
    ];

    result = {
      ...result,
      headline: 'Ürün Vermeyen Ağaç · Genel Tarla Değerlendirmesi',
      summary:
        `${crop} henüz ürün vermiyor olarak kayıtlı. Takvimde “${stageLabel}” görünse de genel değerlendirmede meyve, olgunluk veya hasat önerileri bastırıldı. ` +
        result.summary,
      action: result.importantArea
        ? `${result.importantArea.area} bölümünde ağaç/taç gelişimi, sürgün durumu, su ve beslenme koşullarını komşu alanla karşılaştır; hasat veya olgunluk müdahalesi önerme.`
        : 'Ağaç/taç gelişimini, sürgün durumunu, su ve beslenme koşullarını takip et; hasat veya olgunluk müdahalesi önerme.',
      caution:
        `${result.caution} ${reasons.join(' ')}`,
    };
  } else if (stage === 'harvest_window') {
    result = {
      ...result,
      headline:
        result.status === 'normal'
          ? `Hasat Penceresi · ${result.headline}`
          : result.headline,
      summary:
        `${crop} için mevcut fenolojik dönem “${stageLabel}”. NDVI ve diğer katmanlardaki değişimler aktif büyüme dönemindeki eşiklerle tek başına yorumlanmamalı. ${result.summary}`,
      action:
        result.importantArea
          ? `${result.importantArea.area} bölümünde olgunluk, hasat durumu ve bitki görünümünü diğer alanlarla karşılaştır. ${result.action}`
          : `Olgunluk ve hasat durumunu sahada doğrula. ${result.action}`,
    };
  } else if (
    ['bud_break', 'flowering', 'fruit_set', 'fruit_growth'].includes(stage) &&
    ndvi.quality === 'usable' &&
    ndvi.direction === 'falling'
  ) {
    const causes = Array.isArray(result.likelyCauses)
      ? [...result.likelyCauses]
      : [];

    causes.unshift({
      title: `${stageLabel} döneminde NDVI düşüşü`,
      probability: 'orta',
      reason:
        `Aktif/hassas fenolojik dönemde 90 günlük NDVI trendi düşüyor. Bu durum tek başına teşhis değildir; su, beslenme ve bitki sağlığı sahada birlikte kontrol edilmelidir.`,
    });

    result = {
      ...result,
      status: result.status === 'normal' ? 'dikkat' : result.status,
      likelyCauses: causes.slice(0, 4),
      action:
        result.importantArea
          ? `${result.importantArea.area} bölümünü ${stageLabel.toLocaleLowerCase('tr-TR')} döneminde öncelikli saha kontrolüne al; su, beslenme ve bitki sağlığını birlikte değerlendir.`
          : `${stageLabel} dönemindeki NDVI düşüşünü sahada doğrula; su, beslenme ve bitki sağlığını birlikte kontrol et.`,
    };
  }

  const cautionParts = [result.caution];
  if (lifecycle.climateShiftDays !== 0) {
    uniqueText(
      cautionParts,
      `Fenoloji takvimi ERA5-Land termal sapmasına göre ${lifecycle.climateShiftDays > 0 ? '+' : ''}${lifecycle.climateShiftDays} gün kaydırıldı.`,
    );
  }

  return {
    ...result,
    caution: cautionParts.filter(Boolean).join(' '),
  };
}

async function getSynthesisPhenologySnapshot(input: FieldSynthesisInput) {
  try {
    const snapshot = await getFieldPhenologySnapshot(
      {
        id: input.fieldId,
        name: input.fieldName ?? null,
        crop: input.crop ?? null,
        cropCycle: input.lifecycleContext?.cropCycle ?? null,
        plantingYear: input.lifecycleContext?.plantingYear ?? null,
        bearing:
          typeof input.lifecycleContext?.bearing === 'boolean'
            ? input.lifecycleContext.bearing
            : null,
      },
      {
        forceRefresh: false,
      },
    );

    /*
     * Home fenoloji füzyonu (takvim + NASA Harvest + PCSE/WOFOST) hazırsa
     * Pusula aynı nihai evreyi kullanır. Snapshot'ın iklim/NDVI/context
     * kanıtları korunur; yalnız phenology sonucu tek kaynağa hizalanır.
     */
    return input.phenologyResult
      ? {
          ...snapshot,
          phenology: input.phenologyResult,
          evidence: [
            ...new Set([
              ...(snapshot.evidence ?? []),
              ...(input.phenologyResult.basis ?? []),
            ]),
          ],
          warnings: [
            ...new Set([
              ...(snapshot.warnings ?? []),
              ...(input.phenologyResult.warnings ?? []),
            ]),
          ],
        }
      : snapshot;
  } catch (error) {
    console.warn(
      '[Pusula] genel sentez fenoloji bağlamı alınamadı:',
      error,
    );
    return null;
  }
}

function riskRadarStatus(
  result: RiskRadarResult,
): 'normal' | 'dikkat' | 'kontrol' {
  if (
    result.overall?.level === 'critical' ||
    result.overall?.level === 'high'
  ) {
    return 'kontrol';
  }

  if (result.overall?.level === 'moderate') {
    return 'dikkat';
  }

  return 'normal';
}

function riskRadarProbability(
  score: number,
): 'dusuk' | 'orta' | 'yuksek' {
  if (score >= 65) return 'yuksek';
  if (score >= 30) return 'orta';
  return 'dusuk';
}

function applyRiskRadarToFieldSynthesis(
  synthesis: FieldSynthesisResult,
  risk: RiskRadarResult | null,
): FieldSynthesisResult {
  const compact = compactRiskRadarForPusula(risk);
  const compactFieldId =
    String((compact as any)?.fieldId ?? risk?.field?.id ?? '').trim();
  const canonicalDecision = compactFieldId
    ? buildRiskRadarDecision(
        compactFieldId,
        compact as Parameters<typeof buildRiskRadarDecision>[1],
        new Date(),
      )
    : null;

  // 12.3: Risk yoksa Pusula'ya boş bir alarm ekleme; yalnız ortak context'i taşı.
  if (!canonicalDecision) {
    return {
      ...synthesis,
      riskRadar: compact,
    };
  }

  const radarStatus: 'normal' | 'dikkat' | 'kontrol' =
    canonicalDecision.severity === 'danger'
      ? 'kontrol'
      : canonicalDecision.severity === 'warning'
        ? 'dikkat'
        : 'normal';

  const mergedStatus: FieldSynthesisResult['status'] =
    radarStatus === 'kontrol'
      ? 'kontrol'
      : radarStatus === 'dikkat' && synthesis.status === 'normal'
        ? 'dikkat'
        : synthesis.status;

  const evidence: FieldSynthesisEvidence[] = [
    {
      layer: 'risk-radar' as const,
      layerLabel: canonicalDecision.label || 'Pusula Risk Radarı',
      finding: canonicalDecision.detail,
      status: radarStatus,
    },
    ...(Array.isArray(synthesis.evidence) ? synthesis.evidence : []),
  ].slice(0, 9);

  const canonicalEvidence = Array.isArray(canonicalDecision.evidence)
    ? canonicalDecision.evidence.filter(Boolean).join(' ')
    : '';

  const likelyCauses: FieldSynthesisLikelyCause[] = [
    {
      title: canonicalDecision.title,
      probability:
        canonicalDecision.severity === 'danger'
          ? 'yuksek'
          : 'orta',
      reason: canonicalEvidence || canonicalDecision.detail,
    } as FieldSynthesisLikelyCause,
    ...(Array.isArray(synthesis.likelyCauses)
      ? synthesis.likelyCauses.filter(
          (item) => item.title !== canonicalDecision.title,
        )
      : []),
  ].slice(0, 4);

  const climateTop = (compact as any)?.climateIntelligence?.topSignal ?? null;
  const topThreat = risk?.threats?.[0] ?? null;
  const riskAction =
    String(climateTop?.action ?? '').trim() ||
    String(topThreat?.action ?? risk?.overall?.recommendation ?? '').trim();

  // Pusula, Tarla Durumu ve Bildirimler aynı kanonik başlık/cümle ile başlar.
  const headline = canonicalDecision.title;
  const summary = `${canonicalDecision.detail} ${synthesis.summary}`.trim();
  const action = `${riskAction} ${synthesis.action}`.trim();

  const caution = [
    synthesis.caution,
    risk?.provenance?.note ??
      'Risk skoru erken uyarıdır; kesin teşhis veya otomatik uygulama talimatı değildir.',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    ...synthesis,
    status: mergedStatus,
    headline,
    summary,
    likelyCauses,
    evidence,
    action,
    caution,
    riskRadar: compact,
  };
}


function applyClimateMemoryToFieldSynthesis(
  synthesis: FieldSynthesisResult,
): FieldSynthesisResult {
  const narrative = (synthesis.riskRadar as any)?.climateIntelligence?.memoryNarrative ?? null;
  const summaryText = String(narrative?.summary ?? '').replace(/\s+/g, ' ').trim();

  if (!narrative || !summaryText || narrative.status === 'needs_data') {
    return {
      ...synthesis,
      climateMemoryNarrative: narrative,
    };
  }

  const memoryEvidence: FieldSynthesisEvidence = {
    layer: 'climate-memory',
    layerLabel: 'Sezon İklim Hafızası',
    finding: summaryText,
    // Hafıza bağlamdır; tek başına genel Pusula durumunu alarm seviyesine çıkarmaz.
    status: 'normal',
  };

  const evidence: FieldSynthesisEvidence[] = [
    memoryEvidence,
    ...(Array.isArray(synthesis.evidence) ? synthesis.evidence : []),
  ].slice(0, 10);

  const alreadyInSummary = synthesis.summary.includes(summaryText);
  const actionContext = String(narrative?.actionContext ?? '').replace(/\s+/g, ' ').trim();
  const alreadyInAction = actionContext && synthesis.action.includes(actionContext);

  return {
    ...synthesis,
    summary: alreadyInSummary
      ? synthesis.summary
      : `${synthesis.summary} ${summaryText}`.trim(),
    evidence,
    action:
      actionContext && !alreadyInAction
        ? `${synthesis.action} ${actionContext}`.trim()
        : synthesis.action,
    caution: [
      synthesis.caution,
      'Sezon iklim hafızası süreklilik bağlamıdır; kısa vadeli hava tahmininin yerine geçmez ve tek başına risk skorunu değiştirmez.',
    ]
      .filter(Boolean)
      .join(' '),
    climateMemoryNarrative: narrative,
  };
}

function applyPlantingWindowDecisionToFieldSynthesis(
  synthesis: FieldSynthesisResult,
  decision: PlantingWindowDecisionResult | null,
): FieldSynthesisResult {
  const compact = compactPlantingWindowDecisionForPusula(decision);

  if (!decision || decision.status !== 'ready' || !decision.scenarios.length) {
    return {
      ...synthesis,
      plantingWindowDecision: compact,
    };
  }

  const decisionEvidence: FieldSynthesisEvidence = {
    layer: 'planting-window',
    layerLabel: 'Ekim Penceresi · Tehlikeden Kaçış',
    finding: decision.summary,
    // 13.3 bir planlama karşılaştırmasıdır; genel tarla alarm seviyesini tek başına yükseltmez.
    status: 'normal',
  };

  const evidence: FieldSynthesisEvidence[] = [
    decisionEvidence,
    ...(Array.isArray(synthesis.evidence) ? synthesis.evidence : []),
  ].slice(0, 10);

  const summaryAlreadyIncludes = synthesis.summary.includes(decision.summary);
  const actionAlreadyIncludes = synthesis.action.includes(decision.actionContext);

  return {
    ...synthesis,
    summary: summaryAlreadyIncludes
      ? synthesis.summary
      : `${synthesis.summary} ${decision.summary}`.trim(),
    evidence,
    action: actionAlreadyIncludes
      ? synthesis.action
      : `${synthesis.action} ${decision.actionContext}`.trim(),
    caution: [
      synthesis.caution,
      'Ekim penceresi karşılaştırması geçmiş meteorolojik maruziyet ve tahmini fenoloji zamanlamasına dayanır; tek başına ekim tarihi tavsiyesi, verim artışı veya zarar olasılığı değildir.',
    ]
      .filter(Boolean)
      .join(' '),
    plantingWindowDecision: compact,
  };
}


function applyCropRotationPlanToFieldSynthesis(
  synthesis: FieldSynthesisResult,
  plan: CropRotationPlan | null,
): FieldSynthesisResult {
  const compact = compactCropRotationPlanForPusula(plan);

  if (!plan || (plan.status !== 'ready' && plan.status !== 'needs_history') || !plan.plan.length) {
    return {
      ...synthesis,
      cropRotationPlan: compact,
    };
  }

  const line = plan.plan
    .map((item) => `${item.year} ${item.cropLabel}`)
    .join(' → ');

  const rotationEvidence: FieldSynthesisEvidence = {
    layer: 'crop-rotation',
    layerLabel: 'Münavebe / Ekim Nöbeti',
    finding: `Planlanan sıra: ${line}.`,
    // Gelecek sezon planıdır; mevcut tarla alarm seviyesini tek başına değiştirmez.
    status: 'normal',
  };

  const evidence: FieldSynthesisEvidence[] = [
    rotationEvidence,
    ...(Array.isArray(synthesis.evidence) ? synthesis.evidence : []),
  ].slice(0, 10);

  const summaryText = `Münavebe planı ${line} sırasını öne çıkarıyor.`;
  const alreadyInSummary = synthesis.summary.includes(line);
  const alreadyInAction = synthesis.action.includes(plan.actionContext);

  return {
    ...synthesis,
    summary: alreadyInSummary
      ? synthesis.summary
      : `${synthesis.summary} ${summaryText}`.trim(),
    evidence,
    action: alreadyInAction
      ? synthesis.action
      : `${synthesis.action} ${plan.actionContext}`.trim(),
    caution: [
      synthesis.caution,
      'Münavebe sonucu gelecek sezon planlama desteğidir; bölgesel ürün uygunluğu, sözleşme/pazar koşulları, gübre dozu veya sulama miktarı yerine geçmez.',
    ]
      .filter(Boolean)
      .join(' '),
    cropRotationPlan: compact,
  };
}

export async function interpretUnifiedMap(
  input: UnifiedMapAiInput,
): Promise<UnifiedMapAiResult> {
  if (!supabase) {
    throw new Error('Pusula AI bağlantısı hazır değil.');
  }

  if (!input.fieldId) {
    throw new Error('Pusula AI için tarla seçilmedi.');
  }

  if (!input.activeLayer) {
    throw new Error('Pusula AI için harita katmanı seçilmedi.');
  }

  try {
    const [dataBackbone, orchardSnapshot] = await Promise.all([
      getBackboneSnapshot(input.fieldId),
      loadOrchardIntelligenceSnapshot(input.fieldId, input.crop ?? null).catch((error) => {
        console.warn('[Pusula] ağaç bağlamı aktif harita yorumuna eklenemedi:', error);
        return null;
      }),
    ]);
    const { data, error } = await supabase.functions.invoke(
      'unified-map-ai',
      {
        body: {
          mode: 'single-layer',
          fieldId: input.fieldId,
          fieldName: input.fieldName,
          crop: input.crop,
          periodDays: input.periodDays,
          activeLayer: input.activeLayer,
          activeLayerLabel: input.activeLayerLabel,
          activeLayerContext: input.activeLayerContext,
          cropMode: input.cropMode ?? null,
          context: {
            ...input.context,
            fieldDataBackbone: dataBackbone,
          },
        },
      },
    );

    if (error) {
      const message = await readFunctionError(error);
      console.error('[Pusula] unified-map-ai invoke hatası:', error);
      throw new Error(message);
    }

    if (!data) {
      throw new Error('Pusula boş yanıt döndürdü.');
    }

    if (data.ok === false) {
      throw new Error(
        data.error || 'Pusula harita yorumunu oluşturamadı.',
      );
    }

    if (!data.analysis) {
      throw new Error('Pusula yanıtında analiz bulunamadı.');
    }

    const analysis = applyCropModeToMapAnalysis(
      data.analysis as UnifiedMapAiResult,
      input.cropMode ?? null,
    );

    const withBackbone = applyBackboneToUnifiedResult(
      {
        ...analysis,
        importantArea: analysis.importantArea ?? null,
        model: analysis.model ?? 'pusula-spatial-engine-v2',
        memorySaved: Boolean(data.memorySaved),
        memoryObservationId: data.memoryObservationId ?? null,
        historyUsed: Number(data.historyUsed ?? 0),
        memoryError:
          typeof data.memoryError === 'string' ? data.memoryError : null,
      },
      dataBackbone,
    );

    return applyOrchardToUnifiedResult(withBackbone, orchardSnapshot);
  } catch (error) {
    const message = normalizeErrorMessage(error);
    console.error('[Pusula] harita yorumu:', message);
    throw new Error(message);
  }
}

export async function synthesizeFieldObservations(
  input: FieldSynthesisInput,
): Promise<FieldSynthesisResult> {
  if (!supabase) {
    throw new Error('Pusula AI bağlantısı hazır değil.');
  }

  if (!input.fieldId) {
    throw new Error('Genel değerlendirme için tarla seçilmedi.');
  }

  try {
    const [phenologySnapshot, riskRadarResult, dataBackbone, yieldHarvestSnapshot, orchardSnapshot, orchardChillSnapshot, plantingWindowDecision, cropRotationPlan] = await Promise.all([
      getSynthesisPhenologySnapshot(input),
      fetchFieldRiskRadar(
        input.fieldId,
        {
          seasonStartDate:
            input.lifecycleContext?.plantingDate ?? null,
        },
      ).catch((error) => {
        console.warn(
          '[Pusula] Risk Radarı genel senteze eklenemedi:',
          error,
        );
        return null;
      }),
      getBackboneSnapshot(input.fieldId),
      getYieldHarvestSnapshot(input),
      getOrchardSnapshot(input),
      getOrchardChillSnapshot(input),
      fetchWheatPlantingWindowDecision(input.fieldId).catch((error) => {
        console.warn(
          '[Pusula] ekim penceresi karşılaştırması genel senteze eklenemedi:',
          error,
        );
        return null;
      }),
      loadCropRotationPlan(input.fieldId).catch((error) => {
        console.warn(
          '[Pusula] münavebe planı genel senteze eklenemedi:',
          error,
        );
        return null;
      }),
    ]);

    const lifecycleContext = {
      ...(input.lifecycleContext ?? {}),
      bearing:
        phenologySnapshot?.context?.bearing ??
        input.lifecycleContext?.bearing ??
        null,
      phenologyStage:
        phenologySnapshot?.phenology?.stage ?? null,
      phenologyStageLabel:
        phenologySnapshot?.phenology?.stageLabel ?? null,
      phenologyConfidence:
        phenologySnapshot?.phenology?.confidence ?? null,
      phenologyDataStatus:
        phenologySnapshot?.phenology?.dataStatus ?? null,
      ndviTrend:
        phenologySnapshot?.ndvi?.direction ?? null,
      ndviQuality:
        phenologySnapshot?.ndvi?.quality ?? null,
      climateShiftDays:
        phenologySnapshot?.climateShift?.shiftDays ?? 0,
      climateAnomalyC:
        phenologySnapshot?.climateShift?.anomalyC ?? null,
      riskRadar:
        compactRiskRadarForPusula(riskRadarResult),
    };

    const { data, error } = await supabase.functions.invoke(
      'unified-map-ai',
      {
        body: {
          mode: 'field-synthesis',
          fieldId: input.fieldId,
          fieldName: input.fieldName,
          crop: input.crop,
          cropMode: input.cropMode ?? null,

          /*
            Backend v13 field-synthesis kontrolünden önce activeLayer
            doğruladığı için geriye dönük uyumluluk alanları.
          */
          activeLayer: 'vegetation',
          activeLayerLabel: 'Sağlık',

          weatherContext: input.weatherContext ?? null,
          climateContext: input.climateContext ?? null,
          lifecycleContext,
          riskRadarContext:
            compactRiskRadarForPusula(riskRadarResult),
          plantingWindowContext:
            compactPlantingWindowDecisionForPusula(plantingWindowDecision),
          cropRotationContext:
            compactCropRotationPlanForPusula(cropRotationPlan),
          orchardChillContext:
            compactOrchardChillForPusula(orchardChillSnapshot),
          fieldDataBackbone: dataBackbone,
        },
      },
    );

    if (error) {
      const message = await readFunctionError(error);
      console.error('[Pusula] harmanlama invoke hatası:', error);
      throw new Error(message);
    }

    if (!data) {
      throw new Error('Pusula genel değerlendirme yanıtı boş geldi.');
    }

    if (data.ok === false) {
      throw new Error(
        data.error || 'Pusula genel değerlendirmeyi oluşturamadı.',
      );
    }

    if (!data.synthesis) {
      throw new Error(
        'Pusula yanıtında genel değerlendirme bulunamadı.',
      );
    }

    const rawSynthesis = data.synthesis as FieldSynthesisResult;

    const normalized: FieldSynthesisResult = {
      ...rawSynthesis,
      likelyCauses: Array.isArray(rawSynthesis.likelyCauses)
        ? rawSynthesis.likelyCauses
        : [],
      evidence: Array.isArray(rawSynthesis.evidence)
        ? rawSynthesis.evidence
        : [],
      layersUsed: Array.isArray(rawSynthesis.layersUsed)
        ? rawSynthesis.layersUsed
        : [],
      missingLayers: Array.isArray(rawSynthesis.missingLayers)
        ? rawSynthesis.missingLayers
        : [],
      importantArea: rawSynthesis.importantArea ?? null,
      layerCount: Number(
        rawSynthesis.layerCount ?? rawSynthesis.layersUsed?.length ?? 0,
      ),
      generatedAt:
        rawSynthesis.generatedAt || new Date().toISOString(),
      model: rawSynthesis.model || 'pusula-field-synthesis-v1',
      memorySaved: Boolean(data.memorySaved),
      memoryObservationId: data.memoryObservationId ?? null,
      memoryError:
        typeof data.memoryError === 'string' ? data.memoryError : null,
    };

    const withPhenology = applyPhenologyToFieldSynthesis(
      normalized,
      phenologySnapshot,
    );

    const withRiskRadar = applyRiskRadarToFieldSynthesis(
      withPhenology,
      riskRadarResult,
    );

    const withClimateMemory = applyClimateMemoryToFieldSynthesis(
      withRiskRadar,
    );

    const withPlantingWindow = applyPlantingWindowDecisionToFieldSynthesis(
      withClimateMemory,
      plantingWindowDecision,
    );

    const withCropRotation = applyCropRotationPlanToFieldSynthesis(
      withPlantingWindow,
      cropRotationPlan,
    );

    const withYieldHarvest = applyYieldHarvestToFieldSynthesis(
      withCropRotation,
      yieldHarvestSnapshot,
    );

    const withOrchard = applyOrchardToFieldSynthesis(
      withYieldHarvest,
      orchardSnapshot,
    );

    const withOrchardChill = applyOrchardChillToFieldSynthesis(
      withOrchard,
      orchardChillSnapshot,
    );

    const withBackbone = applyBackboneToFieldSynthesis(
      withOrchardChill,
      dataBackbone,
    );

    return applyCropModeToFieldSynthesis(
      withBackbone,
      input.cropMode ?? null,
    );
  } catch (error) {
    const message = normalizeErrorMessage(error);
    console.error('[Pusula] genel değerlendirme:', message);
    throw new Error(message);
  }
}
