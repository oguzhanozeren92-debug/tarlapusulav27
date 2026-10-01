import type { IrrigationDecisionResult } from '../../irrigation/types/irrigationDecision';
import type { HomeNdviAnomalySignal } from '../../satellite/services/buildNdviAnomalyDecision';
import type { HomeSatelliteTrendSignal } from '../../satellite/services/buildHomeSatelliteDecision';
import type { WeedIntelligenceSignal } from '../../weed/services/weedIntelligence.service';
import type { WeedSatelliteScreeningSignal } from '../../weed/services/weedSatelliteIntelligence.service';
import type { HomeNutrientSignal } from './buildNutrientDecision';

export type NutrientDifferentialCauseKey =
  | 'nitrogen'
  | 'water'
  | 'disease_pest'
  | 'weed'
  | 'drainage'
  | 'compaction';

export type NutrientDifferentialEvidenceStrength =
  | 'strong'
  | 'moderate'
  | 'weak'
  | 'none';

export type NutrientDifferentialCause = {
  key: NutrientDifferentialCauseKey;
  label: string;
  strength: NutrientDifferentialEvidenceStrength;
  evidence: string[];
  diagnosticAuthority: boolean;
};

export type NutrientDifferentialStatus =
  | 'not_triggered'
  | 'needs_evidence'
  | 'alternative_causes_present'
  | 'lab_nitrogen_evidence_present';

export type NutrientDifferentialDiagnosisResult = {
  version: '14.1';
  fieldId: string;
  status: NutrientDifferentialStatus;
  triggered: boolean;
  trigger: {
    kind: 'negative_anomaly' | 'falling_trend' | null;
    observedAt: string | null;
    evidence: string[];
  };
  causes: NutrientDifferentialCause[];
  nitrogenGate: {
    recommendationBlocked: boolean;
    nitrogenInterpretationAllowed: boolean;
    numericDoseAllowed: false;
    reason: string;
  };
  headline: string;
  summary: string;
  action: string;
  evidence: string[];
  missingInputs: string[];
  guardrails: {
    ndviAloneCannotDiagnoseNitrogen: true;
    alternativeCausesMustBeChecked: true;
    laboratoryInterpretationRequiredForNitrogenClaim: true;
    noNumericDoseFromThisFilter: true;
    satelliteWeedSignalIsNotSpeciesDiagnosis: true;
    riskRadarIsNotDiseaseDiagnosis: true;
  };
  generatedAt: string;
};

export type NutrientDifferentialDiagnosisInput = {
  fieldId: string | number | null | undefined;
  crop?: string | null;
  phenology?: {
    stage?: string | null;
    stageLabel?: string | null;
    dataStatus?: string | null;
  } | null;
  anomaly?: HomeNdviAnomalySignal | null;
  satelliteTrend?: HomeSatelliteTrendSignal | null;
  nutrient?: HomeNutrientSignal | null;
  irrigationDecision?: IrrigationDecisionResult | null;
  weed?: WeedIntelligenceSignal | null;
  weedSatellite?: WeedSatelliteScreeningSignal | null;
  fieldSynthesis?: any;
  now?: Date;
};

const LABELS: Record<NutrientDifferentialCauseKey, string> = {
  nitrogen: 'Azot / besin eksikliği',
  water: 'Su stresi',
  disease_pest: 'Hastalık / zararlı',
  weed: 'Yabancı ot rekabeti',
  drainage: 'Drenaj / su fazlası',
  compaction: 'Toprak sıkışması',
};

const STRENGTH_ORDER: Record<NutrientDifferentialEvidenceStrength, number> = {
  none: 0,
  weak: 1,
  moderate: 2,
  strong: 3,
};

function text(value: unknown, max = 500) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function normalize(value: unknown) {
  return text(value, 800)
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i');
}

function compact(values: Array<string | null | undefined>, limit = 8) {
  return [...new Set(values.map((item) => text(item)).filter(Boolean))].slice(0, limit);
}

function stronger(
  current: NutrientDifferentialEvidenceStrength,
  next: NutrientDifferentialEvidenceStrength,
) {
  return STRENGTH_ORDER[next] > STRENGTH_ORDER[current] ? next : current;
}

function activeGrowth(phenology: NutrientDifferentialDiagnosisInput['phenology']) {
  const stage = text(phenology?.stage, 60);
  const usable = text(phenology?.dataStatus, 30) === 'usable';
  return (
    usable &&
    Boolean(stage) &&
    !['unknown', 'pre_sowing', 'post_harvest', 'dormancy', 'leaf_fall'].includes(stage)
  );
}

function recentDate(value: unknown, now: Date, maxAgeDays = 30) {
  const parsed = Date.parse(text(value, 60));
  if (!Number.isFinite(parsed)) return false;
  const age = now.getTime() - parsed;
  return age >= -86_400_000 && age <= maxAgeDays * 86_400_000;
}

function triggerFromInput(
  input: NutrientDifferentialDiagnosisInput,
): NutrientDifferentialDiagnosisResult['trigger'] {
  const now = input.now ?? new Date();
  const fieldId = text(input.fieldId, 100);
  if (!activeGrowth(input.phenology)) {
    return { kind: null, observedAt: null, evidence: [] };
  }

  const anomaly = input.anomaly;
  if (
    anomaly?.status === 'ready' &&
    (!anomaly.fieldId || anomaly.fieldId === fieldId) &&
    anomaly.quality === 'usable' &&
    anomaly.anomaly === true &&
    anomaly.direction === 'negative' &&
    anomaly.observationCount >= 5 &&
    (anomaly.spanDays ?? 0) >= 20 &&
    recentDate(anomaly.latestDate, now)
  ) {
    return {
      kind: 'negative_anomaly' as const,
      observedAt: anomaly.latestDate ?? null,
      evidence: compact([
        `${anomaly.observationCount} gerçek NDVI gözlemi ${anomaly.spanDays} günlük dönem içinde karşılaştırıldı.`,
        Number.isFinite(anomaly.deviation)
          ? `Son NDVI değeri tarla baz medyanından ${Math.abs(Number(anomaly.deviation)).toFixed(3)} daha düşük.`
          : null,
        Number.isFinite(anomaly.robustScore)
          ? `Robust NDVI anomali skoru ${Math.abs(Number(anomaly.robustScore)).toFixed(2)}.`
          : null,
      ], 4),
    };
  }

  const trend = input.satelliteTrend;
  if (
    trend?.status === 'ready' &&
    (!trend.fieldId || trend.fieldId === fieldId) &&
    trend.quality === 'usable' &&
    trend.direction === 'falling' &&
    trend.observationCount >= 3 &&
    (trend.spanDays ?? 0) >= 12 &&
    recentDate(trend.latestDate, now)
  ) {
    return {
      kind: 'falling_trend' as const,
      observedAt: trend.latestDate ?? null,
      evidence: compact([
        `${trend.observationCount} gerçek NDVI gözleminde ${trend.spanDays} günlük düşüş eğilimi var.`,
        trend.latestDate ? `Son uydu gözlemi ${trend.latestDate.slice(0, 10)}.` : null,
      ], 3),
    };
  }

  return { kind: null, observedAt: null, evidence: [] };
}

function synthesisTexts(fieldSynthesis: any) {
  const causes = Array.isArray(fieldSynthesis?.likelyCauses)
    ? fieldSynthesis.likelyCauses
    : [];
  const evidence = Array.isArray(fieldSynthesis?.evidence)
    ? fieldSynthesis.evidence
    : [];
  const visual = fieldSynthesis?.visualDiagnosis?.latest ?? null;

  return compact([
    fieldSynthesis?.headline,
    fieldSynthesis?.summary,
    fieldSynthesis?.action,
    fieldSynthesis?.importantArea?.summary,
    ...causes.flatMap((item: any) => [item?.title, item?.reason]),
    ...evidence.flatMap((item: any) => [item?.layerLabel, item?.finding]),
    visual?.headline,
    visual?.possibleIssue,
    ...(Array.isArray(visual?.observations) ? visual.observations : []),
  ], 30);
}

function labNitrogenEvidence(
  signal: HomeNutrientSignal | null | undefined,
  fieldId: string,
  crop: string | null | undefined,
) {
  const analysis = signal?.latestAnalysis ?? null;
  if (!analysis) {
    return { strength: 'none' as const, evidence: [] as string[] };
  }

  const signalFieldId = text(signal?.fieldId, 100);
  const analysisFieldId = text((analysis as any)?.field_id, 100);
  if ((signalFieldId && signalFieldId !== fieldId) || (analysisFieldId && analysisFieldId !== fieldId)) {
    return {
      strength: 'none' as const,
      evidence: ['Laboratuvar kaydı seçili tarlayla eşleşmediği için azot kanıtı olarak kullanılmadı.'],
    };
  }

  const currentCrop = normalize(crop);
  const reportCrop = normalize((analysis as any)?.crop);
  if (currentCrop && reportCrop && currentCrop !== reportCrop) {
    return {
      strength: 'none' as const,
      evidence: ['Laboratuvar yorumu farklı bir ürün bağlamına ait; güncel ürün için azot kanıtı sayılmadı.'],
    };
  }

  const result = analysis.ai_result ?? null;
  const server = signal?.soilIntelligence?.serverDecision ?? null;
  const candidates = compact([
    result?.soilSummary,
    result?.cropInterpretation,
    ...(Array.isArray(result?.attentionPoints) ? result.attentionPoints : []),
    ...(Array.isArray(result?.recommendations) ? result.recommendations : []),
    server?.headline,
    server?.summary,
    server?.action,
  ], 20);

  const nitrogenMentions = candidates.filter((item) => {
    const normalized = normalize(item);
    return normalized.includes('azot') || normalized.includes('nitrojen');
  });

  const explicitConcern = nitrogenMentions.filter((item) => {
    const normalized = normalize(item);
    return [
      'eksik',
      'dusuk',
      'yetersiz',
      'noksan',
      'takviye',
      'ihtiyac',
      'gereksin',
      'dikkat',
    ].some((token) => normalized.includes(token));
  });

  if (explicitConcern.length) {
    return {
      strength: 'strong' as const,
      evidence: compact([
        'Laboratuvar raporunun yorumunda azotla ilgili açık bir dikkat/eksiklik bulgusu var.',
        ...explicitConcern.map((item) => `Lab yorumu: ${item}`),
      ], 4),
    };
  }

  if (nitrogenMentions.length) {
    return {
      strength: 'weak' as const,
      evidence: compact([
        'Laboratuvar raporunda azot geçiyor ancak eksiklik/düşüklük açıkça doğrulanmıyor.',
        ...nitrogenMentions.map((item) => `Lab yorumu: ${item}`),
      ], 3),
    };
  }

  return {
    strength: 'none' as const,
    evidence: ['Mevcut laboratuvar yorumunda azot eksikliğini açıkça doğrulayan bir ifade yok.'],
  };
}

function waterEvidence(decision: IrrigationDecisionResult | null | undefined) {
  if (!decision) return { strength: 'none' as const, evidence: [] as string[] };

  if (decision.decision === 'irrigate_now') {
    return {
      strength: 'strong' as const,
      evidence: compact([
        'Production Sulama Motoru mevcut su dengesiyle sulama gereksinimi üretiyor.',
        decision.display?.headline,
        decision.display?.waterLabel,
        ...(decision.reasons ?? []).slice(0, 2),
      ], 4),
    };
  }

  if (decision.decision === 'irrigation_approaching') {
    return {
      strength: 'moderate' as const,
      evidence: compact([
        'Sulama Motoru su açığının stres eşiğine yaklaştığını gösteriyor.',
        decision.display?.summary,
      ], 3),
    };
  }

  if (decision.rainfedStress?.riskLevel === 'high') {
    return {
      strength: 'moderate' as const,
      evidence: ['Kuru tarım iklim-su dengesi yüksek su stresi baskısı gösteriyor; bu gerçek toprak nemi ölçümü değildir.'],
    };
  }

  if (decision.rainfedStress?.riskLevel === 'elevated') {
    return {
      strength: 'weak' as const,
      evidence: ['Kuru tarım iklim-su dengesi yükselen su stresi baskısı gösteriyor; bu gerçek toprak nemi ölçümü değildir.'],
    };
  }

  return { strength: 'none' as const, evidence: [] as string[] };
}

function diseasePestEvidence(fieldSynthesis: any) {
  let strength: NutrientDifferentialEvidenceStrength = 'none';
  const evidence: string[] = [];
  const visual = fieldSynthesis?.visualDiagnosis?.latest ?? null;
  const issueType = normalize(visual?.issueType);

  if (
    visual &&
    ['disease', 'pest', 'hastalik', 'zararli'].some((token) => issueType.includes(token)) &&
    !['uncertain', 'clear', 'not_visible'].includes(text(visual?.status, 40))
  ) {
    strength = stronger(strength, 'moderate');
    evidence.push(
      `Saha fotoğrafı AI ön değerlendirmesi ${text(visual?.possibleIssue) || 'hastalık/zararlı'} yönünde bulgu taşıyor; kesin teşhis değildir.`,
    );
  }

  const risk = fieldSynthesis?.riskRadar?.intelligence ?? null;
  const riskType = normalize(risk?.topThreatType);
  const riskLevel = normalize(risk?.riskLevel);
  if (
    risk &&
    ['disease', 'pest', 'hastalik', 'zararli'].some((token) => riskType.includes(token))
  ) {
    const nextStrength = ['high', 'very_high', 'yuksek', 'cok_yuksek'].includes(riskLevel)
      ? 'moderate'
      : 'weak';
    strength = stronger(strength, nextStrength);
    evidence.push(
      `Risk Radarı ${text(risk?.topThreat) || 'hastalık/zararlı'} için erken uyarı bağlamı veriyor; risk teşhis değildir.`,
    );
  }

  return { strength, evidence: compact(evidence, 4) };
}

function weedEvidence(
  weed: WeedIntelligenceSignal | null | undefined,
  satellite: WeedSatelliteScreeningSignal | null | undefined,
) {
  let strength: NutrientDifferentialEvidenceStrength = 'none';
  const evidence: string[] = [];

  if (weed?.presence === 'visible') {
    strength = 'moderate';
    evidence.push(
      `Saha görselinde yabancı ot sinyali görünür durumda${weed.coverPercent != null ? `; yaklaşık kaplama %${weed.coverPercent.toFixed(0)}` : ''}.`,
    );
  } else if (weed?.presence === 'possible') {
    strength = 'weak';
    evidence.push('Saha görselinde yabancı ot olasılığı var; doğrulama gerekiyor.');
  }

  if (satellite?.status === 'persistent-watch' || satellite?.status === 'watch') {
    strength = stronger(strength, 'weak');
    evidence.push(
      'Uydu yabancı ot taraması parsel içi göreli farklılık gösteriyor; uydu tür teşhisi yapmaz.',
    );
  }

  return { strength, evidence: compact(evidence, 4) };
}

function textCauseEvidence(fieldSynthesis: any, tokens: string[]) {
  const texts = synthesisTexts(fieldSynthesis);
  const matched = texts.filter((item) => {
    const normalized = normalize(item);
    return tokens.some((token) => normalized.includes(token));
  });
  return compact(matched.map((item) => `Pusula sentezi: ${item}`), 3);
}

function makeCause(
  key: NutrientDifferentialCauseKey,
  strength: NutrientDifferentialEvidenceStrength,
  evidence: string[],
  diagnosticAuthority = false,
): NutrientDifferentialCause {
  return {
    key,
    label: LABELS[key],
    strength,
    evidence: compact(evidence, 5),
    diagnosticAuthority,
  };
}

export function buildNutrientDifferentialDiagnosis(
  input: NutrientDifferentialDiagnosisInput,
): NutrientDifferentialDiagnosisResult {
  const fieldId = text(input.fieldId, 100);
  const generatedAt = (input.now ?? new Date()).toISOString();
  const trigger = triggerFromInput(input);

  if (!fieldId || !trigger.kind) {
    return {
      version: '14.1',
      fieldId,
      status: 'not_triggered',
      triggered: false,
      trigger,
      causes: [],
      nitrogenGate: {
        recommendationBlocked: true,
        nitrogenInterpretationAllowed: false,
        numericDoseAllowed: false,
        reason: 'Negatif bitki örtüsü sinyali yokken bu filtre besin teşhisi üretmez.',
      },
      headline: 'Yanlış teşhis filtresi beklemede',
      summary: 'Filtre yalnız gerçek NDVI düşüş/anomali sinyali oluştuğunda devreye girer.',
      action: 'Yeni uydu ve saha verisini bekle.',
      evidence: [],
      missingInputs: [],
      guardrails: {
        ndviAloneCannotDiagnoseNitrogen: true,
        alternativeCausesMustBeChecked: true,
        laboratoryInterpretationRequiredForNitrogenClaim: true,
        noNumericDoseFromThisFilter: true,
        satelliteWeedSignalIsNotSpeciesDiagnosis: true,
        riskRadarIsNotDiseaseDiagnosis: true,
      },
      generatedAt,
    };
  }

  const nitrogen = labNitrogenEvidence(input.nutrient, fieldId, input.crop);
  const water = waterEvidence(input.irrigationDecision);
  const diseasePest = diseasePestEvidence(input.fieldSynthesis);
  const weed = weedEvidence(input.weed, input.weedSatellite);
  const drainageEvidence = textCauseEvidence(input.fieldSynthesis, [
    'drenaj',
    'su birik',
    'gollen',
    'waterlog',
    'su fazlasi',
    'taskin',
  ]);
  const compactionEvidence = textCauseEvidence(input.fieldSynthesis, [
    'sikisma',
    'kompaks',
    'pulluk tabani',
    'taban tasi',
  ]);

  const causes = [
    makeCause('nitrogen', nitrogen.strength, nitrogen.evidence, nitrogen.strength === 'strong'),
    makeCause('water', water.strength, water.evidence, water.strength === 'strong'),
    makeCause('disease_pest', diseasePest.strength, diseasePest.evidence, false),
    makeCause('weed', weed.strength, weed.evidence, false),
    makeCause(
      'drainage',
      drainageEvidence.length ? 'weak' : 'none',
      drainageEvidence,
      false,
    ),
    makeCause(
      'compaction',
      compactionEvidence.length ? 'weak' : 'none',
      compactionEvidence,
      false,
    ),
  ];

  const alternativeCauses = causes.filter(
    (cause) =>
      cause.key !== 'nitrogen' &&
      ['strong', 'moderate'].includes(cause.strength),
  );
  const nitrogenConfirmedByLab = nitrogen.strength === 'strong';
  const latestAnalysis = input.nutrient?.latestAnalysis ?? null;

  const status: NutrientDifferentialStatus = nitrogenConfirmedByLab
    ? 'lab_nitrogen_evidence_present'
    : alternativeCauses.length
      ? 'alternative_causes_present'
      : 'needs_evidence';

  const missingInputs = compact([
    !latestAnalysis ? 'soil_or_leaf_lab_analysis' : null,
    !input.irrigationDecision ? 'water_status' : null,
    !input.weed && !input.fieldSynthesis?.visualDiagnosis ? 'field_photo' : null,
  ], 6);

  const alternateLabel = alternativeCauses.map((item) => item.label).join(' · ');
  const headline = nitrogenConfirmedByLab
    ? 'Azot bulgusu var; NDVI yine tek neden değil'
    : alternativeCauses.length
      ? 'Düşük NDVI için önce nedeni ayır'
      : 'Düşük NDVI’nin nedeni henüz doğrulanmadı';

  const summary = nitrogenConfirmedByLab
    ? alternativeCauses.length
      ? `Laboratuvar yorumunda azotla ilgili açık bulgu var; aynı anda ${alternateLabel} yönünde de kanıt bulundu. Uydu düşüşünü tek başına azota bağlama.`
      : 'Laboratuvar yorumunda azotla ilgili açık bulgu var. Bu bulgu NDVI düşüşüyle birlikte değerlendirilebilir ancak uydu sinyali tek başına azot teşhisi değildir.'
    : alternativeCauses.length
      ? `Azot eksikliği laboratuvarla doğrulanmadı. Mevcut kanıtlar ${alternateLabel} olasılıklarını önce kontrol etmeyi gerektiriyor.`
      : 'Azot eksikliği laboratuvarla doğrulanmadı ve su, hastalık/zararlı, yabancı ot, drenaj veya sıkışma nedenlerini ayıracak yeterli saha kanıtı yok.';

  const action = nitrogenConfirmedByLab
    ? 'Azot bulgusunu ürün evresi, son gübreleme ve alternatif stres kanıtlarıyla birlikte değerlendir. Bu filtre sayısal gübre dozu üretmez.'
    : latestAnalysis
      ? 'Mevcut laboratuvar raporu azot eksikliğini açıkça doğrulamıyorsa önce saha kontrolü/fotoğraf ve su durumuyla nedeni doğrula; doğrulanmadan N gübresi önerme.'
      : 'Saha fotoğrafı ve mümkünse güncel toprak/yaprak analiziyle nedeni doğrula; doğrulanmadan N gübresi önerme.';

  const evidence = compact([
    ...trigger.evidence,
    ...causes
      .filter((cause) => cause.strength !== 'none')
      .flatMap((cause) => cause.evidence.map((item) => `${cause.label}: ${item}`)),
  ], 10);

  return {
    version: '14.1',
    fieldId,
    status,
    triggered: true,
    trigger,
    causes,
    nitrogenGate: {
      recommendationBlocked: !nitrogenConfirmedByLab,
      nitrogenInterpretationAllowed: nitrogenConfirmedByLab,
      numericDoseAllowed: false,
      reason: nitrogenConfirmedByLab
        ? 'Laboratuvar yorumunda azotla ilgili açık bulgu var; yine de doz ve uygulama kararı bu filtrenin yetkisi değildir.'
        : 'NDVI düşüşü tek başına azot eksikliği değildir; laboratuvar/saha doğrulaması olmadan N önerisi bloke edilir.',
    },
    headline,
    summary,
    action,
    evidence,
    missingInputs,
    guardrails: {
      ndviAloneCannotDiagnoseNitrogen: true,
      alternativeCausesMustBeChecked: true,
      laboratoryInterpretationRequiredForNitrogenClaim: true,
      noNumericDoseFromThisFilter: true,
      satelliteWeedSignalIsNotSpeciesDiagnosis: true,
      riskRadarIsNotDiseaseDiagnosis: true,
    },
    generatedAt,
  };
}
