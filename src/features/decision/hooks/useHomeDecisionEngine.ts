import { useEffect, useMemo, useRef } from 'react';
import { HOME_REFERENCE_ASSETS } from '../../home/homeAssets';
import { useRecentFieldOperations } from '../../field-operations/hooks/useRecentFieldOperations';
import { useFieldDataBackbone } from '../../data-backbone/hooks/useFieldDataBackbone';
import type { FieldDataBackboneSnapshot, FieldDataEvent } from '../../data-backbone/types/fieldDataBackbone';
import type { FieldOperation } from '../../field-operations/types/fieldOperation';
import { buildNdviAnomalyDecision } from '../../satellite/services/buildNdviAnomalyDecision';
import { getCachedNdviAnomaly } from '../../satellite/services/ndviAnomaly.service';
import {
  useActiveProductionValidation,
  type ActiveProductionValidation,
} from '../../satellite/hooks/useActiveProductionValidation';
import { buildHomeDecisionEvents } from '../services/homeDecisionEngine';
import { buildPlantHealthSynthesisDecision } from '../services/buildPlantHealthSynthesisDecision';
import { buildWeedDecision } from '../services/buildWeedDecision';
import { buildWeedSatelliteDecision } from '../services/buildWeedSatelliteDecision';
import { buildWeedIntelligenceSignal } from '../../weed/services/weedIntelligence.service';
import { useWeedSoilContext } from '../../weed/hooks/useWeedSoilContext';
import {
  buildWeedSoilClue,
  buildWeedSoilDecision,
} from '../../weed/services/weedSoilClue.service';
import {
  buildWeedSatelliteScreening,
  persistWeedSatelliteScreening,
} from '../../weed/services/weedSatelliteIntelligence.service';
import { harmonizeDecisionEvents } from '../services/modelGateway';
import { buildYieldHarvestDecision } from '../../yield-quality/services/buildYieldHarvestDecision';
import { buildOrchardDecision } from '../../orchard/services/buildOrchardDecision';
import { useStorageRiskContext } from '../../storage-risk/hooks/useStorageRiskContext';
import { buildStorageRiskDecision } from '../../storage-risk/services/buildStorageRiskDecision';
import { useIrrigationEconomicsContext } from '../../irrigation-economics/hooks/useIrrigationEconomicsContext';
import { buildIrrigationEconomicsDecision } from '../../irrigation-economics/services/buildIrrigationEconomicsDecision';
import { useFrostPocketContext } from '../../frost-pocket/hooks/useFrostPocketContext';
import { buildFrostPocketDecision } from '../../frost-pocket/services/buildFrostPocketDecision';
import { isOrchardTreePilotCrop } from '../../orchard/services/orchardTree.service';
import { useOrchardTreeContext } from '../../orchard/hooks/useOrchardTreeContext';
import { buildCropModeRuntime } from '../../crop-mode/services/cropMode.service';
import { applyCropModeDecisionPriority } from '../../crop-mode/services/cropModeDecisionPriority.service';
import { collapseRiskDecisionEvents } from '../../risk-climate/services/riskDecisionStream.service';
import { buildNutrientDifferentialDiagnosis } from '../../nutrition/services/nutrientDifferentialDiagnosis.service';
import { buildNutrientDifferentialDecision } from '../../nutrition/services/buildNutrientDifferentialDecision';
import {
  guardNutrientProductionDecision,
  type NutrientProductionDecisionGuardResult,
} from '../../nutrition/services/nutrientProductionDecisionGuard.service';
import type { HarmonizedHomeDecisionEvent } from '../types/modelGateway';
import type {
  HomeDecisionEngineInput,
  HomeDecisionEvent,
  HomeSystemNotification,
  HomeTodayDecision,
  HomeTodayIconKey,
} from '../types/homeDecision';

function todayIconSrc(iconKey: HomeTodayIconKey): string {
  if (iconKey === 'water') return HOME_REFERENCE_ASSETS.iconWater;
  if (iconKey === 'rain') return HOME_REFERENCE_ASSETS.iconRain;
  if (iconKey === 'document') return HOME_REFERENCE_ASSETS.iconDocument;
  if (iconKey === 'leaf-green') return HOME_REFERENCE_ASSETS.iconLeafGreen;
  return HOME_REFERENCE_ASSETS.iconLeafGold;
}

function localDayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatStatusDate(value: string | null | undefined) {
  if (!value) return '';
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return String(value);

  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed);
}

function cleanBackboneText(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}


function activeProductionDecisionEvent(
  fieldId: string | number | null | undefined,
  data: ActiveProductionValidation | null | undefined,
  generatedAt: string | null | undefined,
): HomeDecisionEvent | null {
  const key = String(fieldId ?? '').trim();
  if (!key || !data) return null;

  const evidence = (data.evidence ?? [])
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
    .slice(0, 6);

  const confidence =
    data.confidence === 'high'
      ? ('strong' as const)
      : data.confidence === 'medium'
        ? ('medium' as const)
        : ('preliminary' as const);

  const observedAt = String(generatedAt ?? '').trim() || null;

  if (data.status === 'low_vegetation_signal') {
    return {
      id: `satellite:${key}:active-production:low-signal`,
      group: 'active-production',
      source: 'satellite',
      priority: 91,
      severity: 'warning',
      target: 'map_vegetation',
      channels: ['today', 'notification', 'pusula'],
      kind: 'check',
      label: 'ÜRETİM',
      title: data.headline || 'Aktif Üretim Henüz Doğrulanmadı',
      detail:
        data.summary ||
        'Açık sezon kaydına rağmen güncel bitki örtüsü sinyali düşük. Tarlayı kontrol et.',
      evidence,
      confidence,
      sourceModel: 'active-production-validator:s2+s1+season',
      signal: {
        status: 'ready',
        observedAt,
        maxAgeHours: 36,
      },
      today: {
        tone: 'gold',
        visual: 'spraying',
        iconKey: 'leaf-gold',
        iconClass: 'leaf',
      },
      notification: {
        iconKey: 'leaf',
        iconTone: 'gold',
        dotTone: 'warning',
      },
    };
  }

  if (data.status === 'active_growth_supported') {
    return {
      id: `satellite:${key}:active-production:supported`,
      group: 'active-production',
      source: 'satellite',
      priority: 48,
      severity: 'info',
      target: 'map_vegetation',
      channels: ['pusula'],
      kind: 'data',
      label: 'ÜRETİM',
      title: data.headline || 'Aktif Üretim Sinyali Destekleniyor',
      detail:
        data.summary ||
        'Kayıtlı sezon ile güncel uydu bitki örtüsü sinyali birbiriyle uyumlu.',
      evidence,
      confidence,
      sourceModel: 'active-production-validator:s2+s1+season',
      signal: {
        status: 'ready',
        observedAt,
        maxAgeHours: 36,
      },
      today: {
        tone: 'green',
        visual: 'spraying',
        iconKey: 'leaf-green',
        iconClass: 'leaf',
      },
    };
  }

  if (data.status === 'active_growth_possible') {
    return {
      id: `satellite:${key}:active-production:possible`,
      group: 'active-production',
      source: 'satellite',
      priority: 47,
      severity: 'info',
      target: 'map_vegetation',
      channels: ['pusula'],
      kind: 'data',
      label: 'ÜRETİM',
      title: data.headline || 'Aktif Üretim Olası',
      detail:
        data.summary ||
        'Uydu bitki örtüsü sinyali aktif gelişimle uyumlu olabilir; doğrulama sürüyor.',
      evidence,
      confidence,
      sourceModel: 'active-production-validator:s2+s1+season',
      signal: {
        status: 'partial',
        observedAt,
        maxAgeHours: 36,
      },
      today: {
        tone: 'green',
        visual: 'spraying',
        iconKey: 'leaf-green',
        iconClass: 'leaf',
      },
    };
  }

  if (data.status === 'season_closed') {
    return {
      id: `satellite:${key}:active-production:season-closed`,
      group: 'active-production',
      source: 'satellite',
      priority: 42,
      severity: 'info',
      target: 'field_growth',
      channels: ['pusula'],
      kind: 'data',
      label: 'ÜRETİM',
      title: data.headline || 'Sezon Kapalı',
      detail: data.summary || 'Hasat kaydı nedeniyle güncel uydu sinyali aktif üretim kanıtı sayılmıyor.',
      evidence,
      confidence,
      sourceModel: 'active-production-validator:season',
      signal: {
        status: 'ready',
        observedAt,
        maxAgeHours: null,
      },
      today: {
        tone: 'neutral',
        visual: 'spraying',
        iconKey: 'leaf-green',
        iconClass: 'leaf',
      },
    };
  }

  return null;
}


function backboneEventDay(event: FieldDataEvent) {
  const payloadDay = cleanBackboneText(event.payload?.activityDate);
  if (/^\d{4}-\d{2}-\d{2}$/.test(payloadDay)) return payloadDay;
  if (event.occurredOn && /^\d{4}-\d{2}-\d{2}$/.test(event.occurredOn)) {
    return event.occurredOn;
  }
  const observed = cleanBackboneText(event.observedAt || event.createdAt).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(observed) ? observed : '';
}

function operationFromBackboneEvent(event: FieldDataEvent): FieldOperation | null {
  if (event.domain !== 'operation' || event.eventType !== 'field_operation') return null;
  if (event.mutation === 'deleted') return null;

  const type = cleanBackboneText(event.payload?.activityType);
  const date = backboneEventDay(event);
  if (!type || !date) return null;

  const numberOrNull = (value: unknown) => {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };

  return {
    id: event.sourceRecordId || `backbone:${event.id}`,
    userId: event.userId,
    fieldId: event.fieldId,
    type,
    title: cleanBackboneText(event.payload?.title) || type,
    date,
    productName: cleanBackboneText(event.payload?.productName) || null,
    quantity: numberOrNull(event.payload?.quantity),
    unit: cleanBackboneText(event.payload?.unit) || null,
    cost: numberOrNull(event.payload?.cost),
    notes: cleanBackboneText(event.payload?.notes) || null,
    createdAt: event.createdAt,
  };
}

function operationsFromBackbone(snapshot: FieldDataBackboneSnapshot | null) {
  if (!snapshot) return [] as FieldOperation[];

  const latestByRecord = new Map<string, FieldDataEvent>();
  const anonymous: FieldDataEvent[] = [];

  for (const event of snapshot.events) {
    if (event.domain !== 'operation' || event.eventType !== 'field_operation') continue;
    const key = event.sourceRecordId || '';
    if (!key) {
      anonymous.push(event);
      continue;
    }
    if (!latestByRecord.has(key)) latestByRecord.set(key, event);
  }

  return [...latestByRecord.values(), ...anonymous]
    .map(operationFromBackboneEvent)
    .filter((value): value is FieldOperation => Boolean(value))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

function mergeFieldOperations(primary: FieldOperation[], backbone: FieldOperation[]) {
  const byId = new Map<string, FieldOperation>();
  for (const operation of [...primary, ...backbone]) {
    const id = cleanBackboneText(operation.id);
    const fallback = [operation.fieldId, operation.type, operation.date, operation.productName ?? '']
      .map(cleanBackboneText)
      .join('|');
    const key = id || fallback;
    if (!byId.has(key)) byId.set(key, operation);
  }
  return [...byId.values()]
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, 60);
}

function cropFromBackbone(snapshot: FieldDataBackboneSnapshot | null) {
  if (!snapshot) return '';
  for (const event of snapshot.events) {
    if (event.domain !== 'field_profile') continue;
    if (event.mutation === 'deleted') continue;
    const crop = cleanBackboneText(event.payload?.crop);
    if (crop) return crop;
  }
  for (const event of snapshot.events) {
    if (event.domain !== 'season') continue;
    if (event.mutation === 'deleted') continue;
    const crop = cleanBackboneText(event.payload?.crop);
    if (crop) return crop;
  }
  return '';
}

function hasBackboneSoilAnalysis(snapshot: FieldDataBackboneSnapshot | null) {
  if (!snapshot) return false;
  const latestByRecord = new Map<string, FieldDataEvent>();
  for (const event of snapshot.events) {
    if (event.domain !== 'soil' || event.eventType !== 'soil_analysis') continue;
    const key = event.sourceRecordId || event.id;
    if (!latestByRecord.has(key)) latestByRecord.set(key, event);
  }
  return [...latestByRecord.values()].some((event) => event.mutation !== 'deleted');
}

function buildObservationFollowUpEvent(
  input: HomeDecisionEngineInput,
  now: Date,
): HomeDecisionEvent | null {
  const signal = input.observationFollowUp;
  if (!signal?.pointId) return null;

  const status = signal.comparisonStatus;
  const comparedAt = signal.comparedAt ? new Date(signal.comparedAt) : null;
  const comparisonAgeMs =
    comparedAt && Number.isFinite(comparedAt.getTime())
      ? now.getTime() - comparedAt.getTime()
      : Number.POSITIVE_INFINITY;
  const comparisonRecent =
    comparisonAgeMs >= 0 && comparisonAgeMs <= 72 * 60 * 60 * 1000;

  if (!signal.dueForPhoto && (!status || status === 'unknown' || !comparisonRecent)) {
    return null;
  }

  const area = String(signal.direction ?? '').trim() || 'Takip alanı';
  const areaLabel =
    area.charAt(0).toLocaleUpperCase('tr-TR') + area.slice(1);
  const summary = String(signal.comparisonSummary ?? '').trim();
  const trackedIssueLabel = String(signal.trackedIssueLabel ?? '').trim();
  const trackedIssueStatus = String(signal.trackedIssueStatus ?? '').trim();
  const trackedIssueSummary = String(signal.trackedIssueSummary ?? '').trim();
  const decisionStatus =
    trackedIssueLabel && trackedIssueStatus && trackedIssueStatus !== 'uncertain'
      ? trackedIssueStatus
      : status;
  const issueTitle = trackedIssueLabel
    ? trackedIssueStatus === 'improving'
      ? `${trackedIssueLabel} bulgusu geriliyor`
      : trackedIssueStatus === 'worsening'
        ? `${trackedIssueLabel} bulgusu artıyor`
        : trackedIssueStatus === 'stable'
          ? `${trackedIssueLabel} bulgusu benzer seyrediyor`
          : trackedIssueStatus === 'not_visible'
            ? `${trackedIssueLabel} bulgusu yeni fotoğrafta görünmüyor`
            : ''
    : '';
  const statusTitle =
    issueTitle ||
    (status === 'improving'
      ? `${areaLabel} toparlanıyor`
      : status === 'worsening'
        ? `${areaLabel} zayıflamaya devam ediyor`
        : status === 'stable'
          ? `${areaLabel} benzer seyrediyor`
          : `${areaLabel} yeniden kontrol edilmeli`);

  const title = signal.dueForPhoto
    ? `Tekrar Fotoğraf Zamanı · ${areaLabel}`
    : statusTitle;
  const followUpPeriod =
    signal.latestSatelliteDate ??
    signal.nextPhotoDueAt?.slice(0, 10) ??
    localDayKey(now);
  const detail = signal.dueForPhoto
    ? `${trackedIssueSummary || summary ? `${trackedIssueSummary || summary} ` : ''}Planlı takip günü geldi veya son fotoğraftan daha yeni uydu gözlemi var. Aynı noktadan yeni fotoğraf çekerek değişimi doğrula.`
    : trackedIssueSummary || summary || 'Son iki saha fotoğrafı ve uydu sağlık sinyali karşılaştırıldı.';
  const evidence = [
    trackedIssueLabel
      ? `Takip edilen Pusula AI ön değerlendirmesi: ${trackedIssueLabel}.`
      : '',
    trackedIssueSummary,
    summary && summary !== trackedIssueSummary ? summary : '',
    signal.latestSatelliteDate
      ? `Takip noktasının son uydu tarihi: ${formatStatusDate(signal.latestSatelliteDate)}.`
      : '',
  ].filter(Boolean);

  return {
    id: `satellite:${String(input.homeFieldId ?? input.fieldKey)}:ndvi-follow-up:${signal.pointId}:${
      signal.dueForPhoto ? 'photo-due' : decisionStatus
    }`,
    group: 'satellite-follow-up',
    source: 'satellite',
    priority: signal.dueForPhoto
      ? decisionStatus === 'worsening'
        ? 95
        : 89
      : decisionStatus === 'worsening'
        ? 87
        : 76,
    severity: decisionStatus === 'worsening' ? 'warning' : 'info',
    target: 'map_vegetation',
    channels: (signal.dueForPhoto || decisionStatus === 'worsening'
      ? ['today', 'notification', 'pusula']
      : ['today']) as HomeDecisionEvent['channels'],
    kind: 'check',
    label: signal.dueForPhoto ? 'SAHA TAKİBİ' : 'TAKİP SONUCU',
    title,
    detail,
    evidence,
    task: {
      taskKey: `ndvi-follow-up-photo:${signal.pointId}:${followUpPeriod}`,
      actionTarget: 'field-photo',
      rewardPoints: 0,
      rewardRuleKey: null,
      metadata: {
        source: 'ndvi_follow_up',
        pointId: signal.pointId,
        importantArea: {
          area,
          geometry: signal.areaGeometry ?? null,
        },
        satelliteDate: signal.latestSatelliteDate,
        requestPhoto: signal.dueForPhoto,
      },
    },
    today: {
      tone:
        ['improving', 'not_visible'].includes(decisionStatus) && !signal.dueForPhoto
          ? 'green'
          : 'neutral',
      visual: 'spraying',
      iconKey: 'leaf-green',
      iconClass: 'leaf',
    },
    notification:
      signal.dueForPhoto || decisionStatus === 'worsening'
        ? {
            iconKey: 'leaf',
            iconTone: 'green',
            dotTone: decisionStatus === 'worsening' ? 'warning' : 'info',
          }
        : undefined,
  };
}

/**
 * Bugün ekranı yalnız alarm olduğunda dolmamalı.
 * Buradaki satırlar sahte tarımsal öneri üretmez; sadece gerçekten hazır olan
 * veri kaynağının "uyarı yok / takipte" durumunu veya eksik veri durumunu
 * görünür kılar. Gerçek bir karar olayı varsa düşük öncelikli bu durum satırı
 * onun arkasında kalır.
 */
function buildTodayStatusFillers(
  input: HomeDecisionEngineInput,
  existingEvents: HomeDecisionEvent[],
  now: Date,
): HomeDecisionEvent[] {
  const fieldKey = String(input.fieldKey || 'home');
  const dayKey = localDayKey(now);
  const fillers: HomeDecisionEvent[] = [];
  const todayEvents = existingEvents.filter(
    (event) => event.channels.includes('today') && event.today,
  );
  const todayGroups = new Set(todayEvents.map((event) => event.group));

  const hasWeatherOverview = todayEvents.some((event) =>
    ['weather-status', 'temperature-risk', 'weather-rain'].includes(event.group),
  );

  if (!hasWeatherOverview && input.hasUsableTodayWeather) {
    fillers.push({
      id: `weather:${fieldKey}:overview:${dayKey}`,
      group: 'weather-overview',
      source: 'weather',
      priority: 45,
      severity: 'info',
      target: 'weather',
      channels: ['today'],
      label: 'HAVA',
      title: 'Kritik Hava Uyarısı Yok',
      detail: 'Güncel tahmin alındı; bugün için ayrıca kritik hava eşiği oluşmadı.',
      today: {
        tone: 'green',
        visual: 'irrigation',
        iconKey: 'rain',
        iconClass: 'water',
      },
    });
  }

  const hasSatelliteToday = todayEvents.some(
    (event) => event.source === 'satellite',
  );

  if (!hasSatelliteToday) {
    const satelliteDate = formatStatusDate(input.resolvedHomeSatelliteDate);
    const satelliteReady = Boolean(input.resolvedHomeSatelliteDate);
    const satelliteLoading = input.phenologyTimeSeriesStatus === 'loading';

    fillers.push({
      id: `satellite:${fieldKey}:status:${dayKey}`,
      group: 'satellite-status',
      source: 'satellite',
      priority: 44,
      severity: 'info',
      target: 'map_vegetation',
      channels: ['today'],
      label: 'UYDU',
      title: satelliteReady
        ? 'Uydu Takibi Güncel'
        : satelliteLoading
          ? 'Uydu Geçmişi Hazırlanıyor'
          : 'Uydu Kararı İçin Veri Bekleniyor',
      detail: satelliteReady
        ? `Son veri ${satelliteDate}; bugün ayrıca müdahale gerektiren bir uydu olayı üretilmedi.`
        : satelliteLoading
          ? 'Geçmiş gözlemler karşılaştırılıyor; hazır olduğunda değişim kararı burada görünecek.'
          : 'Karşılaştırmalı uydu gözlemi oluştuğunda gelişim değişimi burada değerlendirilecek.',
      today: {
        tone: satelliteReady ? 'green' : 'neutral',
        visual: 'spraying',
        iconKey: 'leaf-green',
        iconClass: 'leaf',
      },
    });
  }

  if (!todayGroups.has('phenology')) {
    const phenologyUsable = Boolean(
      input.phenology?.dataStatus === 'usable' &&
        input.phenology?.stage &&
        input.phenology.stage !== 'unknown',
    );
    const stageLabel = String(input.phenology?.stageLabel ?? '').trim();
    const phenologyEvidence = (input.phenology?.basis ?? [])
      .map((item) => String(item ?? '').trim())
      .filter(Boolean)
      .slice(0, 4);
    const evidenceText = phenologyEvidence.join(' ').toLocaleLowerCase('tr-TR');
    const phenologySourceModel = evidenceText.includes('nasa harvest')
      ? evidenceText.includes('wofost') || evidenceText.includes('pcse')
        ? 'phenology-fusion:nasa-harvest+pcse'
        : 'nasa-harvest-crop-stage'
      : evidenceText.includes('wofost') || evidenceText.includes('pcse')
        ? 'pcse-wofost-phenology'
        : 'phenology';
    const phenologyConfidence = input.phenology?.confidence === 'high'
      ? 'strong' as const
      : input.phenology?.confidence === 'medium'
        ? 'medium' as const
        : 'preliminary' as const;

    fillers.push({
      id: `phenology:${fieldKey}:status:${dayKey}`,
      group: 'phenology-status',
      source: 'phenology',
      priority: 43,
      severity: 'info',
      target: 'ai',
      channels: ['today'],
      label: 'GELİŞİM',
      title: phenologyUsable
        ? `${stageLabel || 'Gelişim Evresi'} Takipte`
        : 'Gelişim Evresi İçin Bilgi Eksik',
      detail: phenologyUsable
        ? String(input.phenology?.summary ?? '').trim() ||
          'Gelişim evresi bugünkü sulama, hava ve risk kararlarında bağlam olarak kullanılıyor.'
        : 'Sezon ve gelişim verisi tamamlandıkça fenoloji kararı netleşecek.',
      evidence: phenologyUsable ? phenologyEvidence : undefined,
      confidence: phenologyUsable ? phenologyConfidence : 'preliminary',
      sourceModel: phenologyUsable ? phenologySourceModel : 'phenology',
      today: {
        tone: phenologyUsable ? 'green' : 'neutral',
        visual: 'spraying',
        iconKey: 'leaf-green',
        iconClass: 'leaf',
      },
    });
  }

  if (!todayGroups.has('nutrition')) {
    const nutrientReady = input.nutrient?.status === 'ready';
    const hasAnalysis = Boolean(
      (nutrientReady &&
        input.nutrient?.latestAnalysis &&
        String(input.nutrient.latestAnalysis.field_id ?? '') ===
          String(input.homeFieldId ?? '')) ||
        hasBackboneSoilAnalysis(input.dataBackbone ?? null),
    );

    fillers.push({
      id: `nutrition:${fieldKey}:status:${dayKey}`,
      group: 'nutrition-status',
      source: 'nutrition',
      priority: 42,
      severity: 'info',
      target: 'soil',
      channels: ['today'],
      label: 'TOPRAK',
      title: hasAnalysis
        ? 'Toprak Analizi Takipte'
        : nutrientReady
          ? 'Toprak Analizi İçin Bilgi Eksik'
          : 'Toprak Verisi Henüz Karar Üretmedi',
      detail: hasAnalysis
        ? 'Kayıtlı laboratuvar analizinde bugün için ayrıca bir rapor uyarısı oluşmadı.'
        : nutrientReady
          ? 'Gübreleme kararını güçlendirmek için bu tarlanın laboratuvar analizini ekle.'
          : 'Toprak analizi hazır olduğunda gübreleme kararları gerçek saha verisiyle desteklenecek.',
      today: {
        tone: hasAnalysis ? 'green' : 'neutral',
        visual: 'spraying',
        iconKey: 'document',
        iconClass: 'leaf',
      },
    });
  }

  if (
    input.homeFieldId &&
    !String(input.homeFieldCrop ?? '').trim() &&
    !todayGroups.has('field-profile')
  ) {
    fillers.push({
      id: `field:${fieldKey}:missing-crop:today`,
      group: 'field-profile',
      source: 'field',
      priority: 41,
      severity: 'info',
      target: 'home',
      channels: ['today'],
      label: 'TARLA',
      title: 'Ürün Bilgisi Eksik',
      detail: 'Fenoloji ve ürün odaklı kararlar için tarlanın ürün bilgisini tamamla.',
      today: {
        tone: 'neutral',
        visual: 'spraying',
        iconKey: 'document',
        iconClass: 'leaf',
      },
    });
  }

  const hasPusulaToday = todayEvents.some((event) => event.group === 'pusula');
  const synthesisStatus = String(input.fieldSynthesis?.status ?? '').trim();

  if (!hasPusulaToday && input.fieldSynthesis && synthesisStatus === 'normal') {
    fillers.push({
      id: `pusula:${fieldKey}:normal:${dayKey}`,
      group: 'pusula-status',
      source: 'pusula',
      priority: 40,
      severity: 'info',
      target: 'ai',
      channels: ['today'],
      label: 'PUSULA',
      title: 'Belirgin Alan Uyarısı Yok',
      detail: 'Mevcut tarla sentezinde bugün ayrıca saha kontrolü gerektiren bir alan uyarısı oluşmadı.',
      today: {
        tone: 'green',
        visual: 'spraying',
        iconKey: 'leaf-green',
        iconClass: 'leaf',
      },
    });
  }

  return fillers;
}

function selectTodayEvents(events: HomeDecisionEvent[]): HomeDecisionEvent[] {
  const seenGroups = new Set<string>();

  return events
    .filter((event) => event.channels.includes('today') && event.today)
    .filter((event) => {
      if (seenGroups.has(event.group)) return false;
      seenGroups.add(event.group);
      return true;
    })
    .slice(0, 5);
}

function makeAllClearEvent(fieldKey: string): HomeDecisionEvent {
  return {
    id: `status:${fieldKey || 'home'}:all-clear`,
    group: 'status',
    source: 'field',
    priority: 1,
    severity: 'info',
    target: 'home',
    channels: ['today'],
    label: 'BUGÜN',
    title: 'Acil İşlem Görünmüyor',
    detail: 'Yeni veri geldikçe burası otomatik güncellenecek',
    today: {
      tone: 'green',
      visual: 'irrigation',
      iconKey: 'leaf-green',
      iconClass: 'leaf',
    },
  };
}

function toTodayDecision(
  event: HomeDecisionEvent | HarmonizedHomeDecisionEvent,
  fieldId?: string | null,
): HomeTodayDecision | null {
  if (!event.today) return null;

  return {
    id: event.id,
    group: event.group,
    priority: event.priority,
    label: event.label,
    title: event.title,
    detail: event.detail,
    tone: event.today.tone,
    visual: event.today.visual,
    iconSrc: todayIconSrc(event.today.iconKey),
    iconClass: event.today.iconClass,
    target: event.target,
    fieldId: fieldId ?? null,
    source: event.source,
    evidence: event.evidence,
    confidence: 'gateway' in event ? event.gateway.confidence : event.confidence,
    kind: event.kind,
    missingInfoKind: event.missingInfoKind,
    task: event.task,
  };
}

function toNotification(event: HomeDecisionEvent): HomeSystemNotification | null {
  if (!event.notification || !event.channels.includes('notification')) return null;

  return {
    id: event.id,
    priority: event.priority,
    severity: event.severity,
    source: event.source,
    title: event.title,
    detail: event.detail,
    iconKey: event.notification.iconKey,
    iconTone: event.notification.iconTone,
    dotTone: event.notification.dotTone,
    target: event.target,
    task: event.task,
  };
}

export function useHomeDecisionEngine(input: HomeDecisionEngineInput) {
  const recentOperations = useRecentFieldOperations(input.homeFieldId, 30);
  const nutrientGuardRef = useRef<NutrientProductionDecisionGuardResult | null>(null);
  const archivedNutrientGuardKeyRef = useRef('');
  const dataBackbone = useFieldDataBackbone(input.homeFieldId, 140);
  const activeProduction = useActiveProductionValidation(input.homeFieldId);
  const weedSoilContext = useWeedSoilContext(input.homeFieldId ?? input.fieldKey);

  const backboneOperations = useMemo(
    () => operationsFromBackbone(dataBackbone.snapshot),
    [dataBackbone.signature, dataBackbone.snapshot],
  );

  const mergedOperations = useMemo(
    () => mergeFieldOperations(recentOperations.operations, backboneOperations),
    [recentOperations.operations, backboneOperations],
  );

  const resolvedCrop = useMemo(() => {
    const direct = cleanBackboneText(input.homeFieldCrop);
    return direct || cropFromBackbone(dataBackbone.snapshot) || null;
  }, [input.homeFieldCrop, dataBackbone.signature, dataBackbone.snapshot]);

  const resolvedInput = useMemo<HomeDecisionEngineInput>(
    () => ({
      ...input,
      homeFieldCrop: resolvedCrop,
      recentFieldOperations: mergedOperations,
      dataBackbone: dataBackbone.snapshot,
    }),
    [input, resolvedCrop, mergedOperations, dataBackbone.snapshot],
  );

  const orchard = useOrchardTreeContext(
    input.homeFieldId,
    resolvedCrop,
    Boolean(input.homeFieldId && isOrchardTreePilotCrop(resolvedCrop)),
  );

  const storageRisk = useStorageRiskContext(input.homeFieldId);
  const irrigationEconomics = useIrrigationEconomicsContext(
    input.homeFieldId,
    input.irrigationDecision ?? null,
  );
  const frostPocket = useFrostPocketContext(
    input.homeFieldId,
    input.quickTemperatureMin ?? null,
  );

  const cachedAnomaly = getCachedNdviAnomaly(input.homeFieldId);

  const weedSatelliteScreening = useMemo(
    () =>
      buildWeedSatelliteScreening({
        fieldId: input.homeFieldId ?? input.fieldKey,
        homePusulaResult: input.homePusulaResult,
        ndviStats: input.homeNdviStats,
        phenology: input.phenology,
        resolvedSatelliteDate: input.resolvedHomeSatelliteDate ?? null,
      }),
    [
      input.homeFieldId,
      input.fieldKey,
      input.homePusulaResult,
      input.homeNdviStats,
      input.phenology,
      input.resolvedHomeSatelliteDate,
    ],
  );

  useEffect(() => {
    persistWeedSatelliteScreening(weedSatelliteScreening);
  }, [
    weedSatelliteScreening?.fieldId,
    weedSatelliteScreening?.sceneDate,
    weedSatelliteScreening?.status,
    weedSatelliteScreening?.confidencePercent,
    weedSatelliteScreening?.candidateAreaCount,
    weedSatelliteScreening?.persistence,
    weedSatelliteScreening?.spread,
  ]);

  const events = useMemo(() => {
    const baseEvents = buildHomeDecisionEvents(resolvedInput);
    const now = input.now ?? new Date();
    const riskEvent = buildPlantHealthSynthesisDecision({
      fieldId: input.homeFieldId,
      radar: input.fieldSynthesis?.riskRadar ?? null,
      observation: input.observationFollowUp ?? null,
      phenology: input.phenology ?? null,
      now,
    });
    const activeProductionEvent = activeProductionDecisionEvent(
      input.homeFieldId ?? input.fieldKey,
      activeProduction.data,
      activeProduction.generatedAt,
    );
    const activeGrowth = Boolean(
      input.phenology?.dataStatus === 'usable' &&
        input.phenology?.stage &&
        input.phenology.stage !== 'unknown' &&
        input.phenology.stage !== 'post_harvest',
    );
    const anomalySignal = cachedAnomaly
      ? {
          ...cachedAnomaly,
          fieldId: String(input.homeFieldId ?? ''),
          status: 'ready' as const,
        }
      : null;
    const anomalySpatialArea =
      input.fieldSynthesis?.prioritySource?.layer === 'vegetation' &&
      String(input.fieldSynthesis?.importantArea?.area ?? '').trim()
        ? input.fieldSynthesis.importantArea
        : null;
    const anomalyEvent = buildNdviAnomalyDecision(
      String(input.homeFieldId ?? ''),
      anomalySignal,
      activeGrowth,
      now,
      anomalySpatialArea,
    );
    // Ürün kararı: NDVI/saha takip noktaları görev veya bildirim üretmez.
    // Takip kanıtı analiz/PDF bağlamında yaşamaya devam eder; Home event zincirine girmez.
    const observationFollowUpEvent: HomeDecisionEvent | null = null;
    const weedSignal = buildWeedIntelligenceSignal(
      input.homeFieldId ?? input.fieldKey,
      dataBackbone.snapshot,
    );
    const weedEvent = buildWeedDecision(
      input.homeFieldId ?? input.fieldKey,
      weedSignal,
    );
    const weedSoilClue = buildWeedSoilClue(
      weedSignal,
      weedSoilContext.data,
    );
    const weedSoilEvent = buildWeedSoilDecision(
      input.homeFieldId ?? input.fieldKey,
      weedSoilClue,
    );
    const nutrientDifferential = buildNutrientDifferentialDiagnosis({
      fieldId: input.homeFieldId ?? input.fieldKey,
      crop: resolvedInput.homeFieldCrop ?? null,
      phenology: input.phenology ?? null,
      anomaly: anomalySignal,
      satelliteTrend: input.satelliteTrend ?? null,
      nutrient: input.nutrient ?? null,
      irrigationDecision: input.irrigationDecision ?? null,
      weed: weedSignal,
      weedSatellite: weedSatelliteScreening,
      fieldSynthesis: input.fieldSynthesis ?? null,
      now,
    });
    const nutrientDifferentialEvent =
      buildNutrientDifferentialDecision(nutrientDifferential);
    const authoritativeNutrientEvent = baseEvents.find(
      (event) => event.source === 'nutrition' || event.group === 'nutrition',
    ) ?? null;
    const nutrientProductionGuard = guardNutrientProductionDecision({
      fieldId: input.homeFieldId ?? input.fieldKey,
      crop: resolvedInput.homeFieldCrop ?? null,
      authoritativeEvent: authoritativeNutrientEvent,
      differential: nutrientDifferential,
      differentialEvent: nutrientDifferentialEvent,
      nutrient: input.nutrient ?? null,
      ndviStats: input.homeNdviStats ?? null,
      phenology: input.phenology ?? null,
      recentOperations: mergedOperations,
      photoFollowUpDue: Boolean(input.observationFollowUp?.dueForPhoto),
      now,
    });
    nutrientGuardRef.current = nutrientProductionGuard;
    const guardedNutrientEvent = nutrientProductionGuard.event;
    const weedSatelliteEvent = buildWeedSatelliteDecision(
      input.homeFieldId ?? input.fieldKey,
      weedSatelliteScreening,
    );
    const yieldHarvestEvent = buildYieldHarvestDecision(
      input.fieldSynthesis?.yieldHarvest ?? null,
    );
    const orchardEvent = buildOrchardDecision(orchard.snapshot);
    const storageRiskEvent = buildStorageRiskDecision(storageRisk.snapshot);
    const irrigationEconomicsEvent = buildIrrigationEconomicsDecision(irrigationEconomics.snapshot);
    const frostPocketEvent = buildFrostPocketDecision(frostPocket.snapshot);
    const effectiveWeedSatelliteEvent = weedEvent ? null : weedSatelliteEvent;

    // 14.2: HomeDecisionEngine'in ürettiği tek nutrition olayı burada
    // production guard'dan geçirilir. soil-nutrition-engine otoritesi korunur;
    // filtre yalnız kullanıcıya çıkan olayı laboratuvar + son gübreleme + fenoloji
    // + alternatif stres bağlamıyla güvenli hale getirir.
    let merged = baseEvents.filter(
      (event) => event.source !== 'nutrition' && event.group !== 'nutrition',
    );

    if (riskEvent) {
      const hasSpatialAlert = Boolean(
        String(input.fieldSynthesis?.importantArea?.area ?? '').trim(),
      );
      merged = hasSpatialAlert
        ? merged
        : merged.filter(
            (event) => !(event.group === 'pusula' && event.source === 'pusula'),
          );
    }

    if (anomalyEvent || nutrientDifferentialEvent) {
      merged = merged.filter((event) => event.group !== 'satellite-trend');
    }

    // 14.1: Negatif NDVI sinyali varsa klasik uydu uyarısını tek başına bırakma.
    // Önce besin/su/hastalık/yabancı ot/drenaj/sıkışma ayrım filtresi çalışır.
    // Filtre aktifse aynı gözlem için ikinci bir NDVI kartı üretmeyiz.
    const effectiveNutrientDifferentialEvent = guardedNutrientEvent
      ? null
      : input.observationFollowUp?.dueForPhoto
        ? null
        : nutrientDifferentialEvent;
    const effectiveAnomalyEvent =
      input.observationFollowUp?.dueForPhoto || nutrientDifferentialEvent
        ? null
        : anomalyEvent;
    const photoEvidenceWasSynthesized = Boolean(
      riskEvent?.sourceModel?.includes('field-photo'),
    );
    const effectiveObservationFollowUpEvent =
      photoEvidenceWasSynthesized && !input.observationFollowUp?.dueForPhoto
        ? null
        : observationFollowUpEvent;
    const realEvents = [
      frostPocketEvent,
      storageRiskEvent,
      irrigationEconomicsEvent,
      orchardEvent,
      yieldHarvestEvent,
      weedEvent,
      weedSoilEvent,
      effectiveWeedSatelliteEvent,
      activeProductionEvent,
      riskEvent,
      effectiveObservationFollowUpEvent,
      guardedNutrientEvent,
      effectiveNutrientDifferentialEvent,
      effectiveAnomalyEvent,
      ...merged,
    ].filter((event): event is HomeDecisionEvent => Boolean(event));

    const fillers = buildTodayStatusFillers(resolvedInput, realEvents, now);

    const fieldProfilePayload =
      dataBackbone.snapshot?.latestByDomain?.field_profile?.payload ?? {};
    const cropMode = buildCropModeRuntime({
      crop: input.homeFieldCrop ?? '',
      cropCycle:
        (fieldProfilePayload as any)?.cropCycle ??
        (fieldProfilePayload as any)?.crop_cycle ??
        undefined,
      irrigationStatus:
        (fieldProfilePayload as any)?.irrigationStatus ??
        (fieldProfilePayload as any)?.irrigation_status ??
        undefined,
      bearing: (fieldProfilePayload as any)?.bearing,
    });

    const cropAwareEvents = applyCropModeDecisionPriority(
      [...realEvents, ...fillers],
      cropMode,
      { riskRadar: input.fieldSynthesis?.riskRadar ?? null },
    );

    // 12.3: Aynı riskin Weather / Risk Radar / Pusula tarafından farklı
    // cümlelerle çoğaltılmasını burada kes. Kanonik risk olayı zaten Today,
    // Notification ve Pusula kanallarını tek event üzerinden besler.
    const singleRiskStreamEvents = collapseRiskDecisionEvents(
      cropAwareEvents,
      riskEvent,
    );

    const sortedEvents = singleRiskStreamEvents.sort(
      (a, b) => b.priority - a.priority || a.id.localeCompare(b.id),
    );

    return harmonizeDecisionEvents(
      sortedEvents,
      input.homeFieldId ?? input.fieldKey,
      now.toISOString(),
    );
  }, [
    resolvedInput,
    mergedOperations,
    input.homeFieldId,
    input.homeFieldCrop,
    input.fieldSynthesis,
    input.now,
    input.phenology,
    input.observationFollowUp,
    dataBackbone.signature,
    cachedAnomaly,
    weedSatelliteScreening,
    orchard.snapshot,
    storageRisk.snapshot,
    irrigationEconomics.snapshot,
    frostPocket.snapshot,
    activeProduction.signature,
    activeProduction.data,
    activeProduction.generatedAt,
    weedSoilContext.data,
    weedSoilContext.generatedAt,
  ]);

  useEffect(() => {
    const fieldId = String(input.homeFieldId ?? input.fieldKey ?? '').trim();
    const guard = nutrientGuardRef.current;
    if (!fieldId || !guard || guard.fieldId !== fieldId) return;
    const archivable = Boolean(
      guard.event ||
      guard.blockedNitrogenClaim ||
      guard.zoningReadiness.samplingPlan.allowed
    );
    if (!archivable) return;

    const archiveKey = [
      guard.fieldId,
      guard.event?.id ?? 'zoning-only',
      guard.blockedNitrogenClaim ? 'blocked' : 'open',
      guard.recentFertilization.date ?? 'no-fertilization',
      guard.phenologyContext.stage ?? 'no-stage',
      guard.alternativeCauseLabels.join(','),
      guard.localNutrientContext.acquiredAt ?? 'no-sl2p',
      guard.localNutrientContext.biophysicsQuality ?? 'no-biophysics-quality',
      guard.localNutrientContext.laiTrend ?? 'no-lai-trend',
      guard.localNutrientContext.cccTrend ?? 'no-ccc-trend',
      guard.zoningReadiness.status,
      guard.zoningReadiness.samplingPlan.allowed ? 'sampling-ready' : 'sampling-not-ready',
      guard.zoningReadiness.samplingPlan.candidates.map((candidate) => candidate.area).join(','),
      guard.zoningReadiness.spatialSignal.sceneId ?? 'no-zoning-scene',
    ].join('|');

    if (archivedNutrientGuardKeyRef.current === archiveKey) return;
    let cancelled = false;

    void import('../../pusula-pdf/services/pusulaPdfDecisionEvidence.service')
      .then((module) => module.mirrorNutrientProductionGuardEvidenceForPdf(fieldId, guard))
      .then((saved) => {
        if (!cancelled && saved) archivedNutrientGuardKeyRef.current = archiveKey;
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn('[TarlaPusula] 14.7 besin karar/zonlama bağlamı PDF arşivine yazılamadı:', error);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [events, input.homeFieldId, input.fieldKey]);

  const todayDecisions = useMemo(() => {
    const selected = selectTodayEvents(events);
    const source = selected.length > 0
      ? selected
      : [makeAllClearEvent(input.fieldKey)];

    const fieldId = String(input.homeFieldId ?? input.fieldKey ?? '').trim() || null;
    return source
      .map((event) => toTodayDecision(event, fieldId))
      .filter((item): item is HomeTodayDecision => Boolean(item));
  }, [events, input.fieldKey]);

  const notifications = useMemo(
    () =>
      events
        .map(toNotification)
        .filter((item): item is HomeSystemNotification => Boolean(item))
        .slice(0, 12),
    [events],
  );

  const primaryDecision = useMemo(
    () => events.find((event) => event.channels.includes('today')) ?? events[0] ?? null,
    [events],
  );

  const pusulaDecision = useMemo(
    () => events.find((event) => event.channels.includes('pusula')) ?? null,
    [events],
  );

  return {
    events,
    todayDecisions,
    notifications,
    primaryDecision,
    pusulaDecision,
    // 14.4: Pusula görünümü aynı kanonik besin guard sonucunu kullanır.
    // Ref burada yalnız okuma amaçlı dışarı verilir; yeni karar üretmez.
    nutrientProductionGuard: nutrientGuardRef.current,
    modelSignals: events.map((event) => event.gateway),
    recentFieldOperations: mergedOperations,
    recentFieldOperationsReady:
      !recentOperations.loading && !recentOperations.error && !dataBackbone.loading,
    dataBackbone: dataBackbone.snapshot,
    dataBackboneReady: dataBackbone.ready,
    dataBackboneError: dataBackbone.error,
    orchardSnapshot: orchard.snapshot,
    orchardLoading: orchard.loading,
    orchardError: orchard.error,
    storageRiskSnapshot: storageRisk.snapshot,
    irrigationEconomicsSnapshot: irrigationEconomics.snapshot,
    frostPocketSnapshot: frostPocket.snapshot,
  };
}
