import { supabase } from '../../../supabaseClient';

import type {
  PhenologyResult,
  PhenologyStage,
} from '../types/phenology';

export type PcsePhenologyEvidenceStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'partial'
  | 'missing'
  | 'blocked'
  | 'running'
  | 'skipped'
  | 'error';

export type PcsePhenologyEvidence = {
  status: Exclude<PcsePhenologyEvidenceStatus, 'idle' | 'loading'>;
  engine: 'pcse-wofost';
  model: string;
  productionAuthority: false;
  waterStressAuthority: false;
  rawStage: string | null;
  canonicalStage: PhenologyStage | null;
  dvs: number | null;
  completedAt: string | null;
  missingInputs: string[];
  runId: string | null;
  message: string | null;
};

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function textOrNull(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizeText(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function canonicalPcseStage(value: unknown): PhenologyStage | null {
  const stage = normalizeText(value);
  if (!stage) return null;

  if (
    /post[ -]?harvest|after harvest|hasat sonrasi/.test(stage)
  ) {
    return 'post_harvest';
  }

  if (
    /harvest|harvest window|hasat/.test(stage)
  ) {
    return 'harvest_window';
  }

  if (
    /matur|ripen|senesc|grain fill|grain filling|dane dol|olgun/.test(stage)
  ) {
    return 'maturation';
  }

  if (
    /anthesis|flower|reproduct|heading|booting|ear emergence|cicek|basaklan/.test(stage)
  ) {
    return 'reproductive';
  }

  if (
    /vegetat|tiller|stem elong|leaf development|canopy develop|vejetatif|kardeslen|sapa kalk/.test(stage)
  ) {
    return 'vegetative';
  }

  if (
    /emerg|establish|germin|sowing|planting|crop start|cikis|cimlen|ekim/.test(stage)
  ) {
    return 'establishment';
  }

  return null;
}

function normalizeStatus(value: unknown): PcsePhenologyEvidence['status'] {
  switch (String(value ?? '').trim().toLowerCase()) {
    case 'ready': return 'ready';
    case 'partial': return 'partial';
    case 'blocked': return 'blocked';
    case 'running': return 'running';
    case 'skipped': return 'skipped';
    case 'error': return 'error';
    default: return 'missing';
  }
}

function objectOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function firstText(
  containers: Array<Record<string, unknown> | null>,
  keys: string[],
) {
  for (const container of containers) {
    if (!container) continue;

    for (const key of keys) {
      const value = textOrNull(container[key]);
      if (value) return value;
    }
  }

  return null;
}

function firstNumber(
  containers: Array<Record<string, unknown> | null>,
  keys: string[],
) {
  for (const container of containers) {
    if (!container) continue;

    for (const key of keys) {
      const value = numberOrNull(container[key]);
      if (value !== null) return value;
    }
  }

  return null;
}

function normalizeMissingInputs(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(
        value
          .map((item) => String(item ?? '').trim())
          .filter(Boolean),
      )]
    : [];
}

/**
 * Existing live pcse-pilot-run returns the model result under `result`.
 * Keep the parser deliberately tolerant because the model gateway has had
 * more than one output envelope while the scientific meaning stayed the same.
 */
function extractPcseRunResult(value: unknown) {
  const root = objectOrNull(value) ?? {};
  const result = objectOrNull(root.result);
  const details = objectOrNull(result?.details);
  const phenology = objectOrNull(result?.phenology);
  const metrics = objectOrNull(result?.metrics);
  const resultResult = objectOrNull(result?.result);
  const resultResultDetails = objectOrNull(resultResult?.details);
  const resultResultMetrics = objectOrNull(resultResult?.metrics);

  const textContainers = [
    result,
    resultResult,
    details,
    phenology,
    resultResultDetails,
  ];

  const numberContainers = [
    metrics,
    resultResultMetrics,
    result,
    resultResult,
    details,
    phenology,
    resultResultDetails,
  ];

  const rawStage = firstText(textContainers, [
    'stage',
    'stage_label',
    'stageLabel',
    'phenology_stage',
    'phenologyStage',
    'growth_stage',
    'growthStage',
  ]);

  const dvs = firstNumber(numberContainers, [
    'dvs',
    'DVS',
  ]);

  const model = firstText(textContainers, [
    'model',
    'model_name',
    'modelName',
    'pilot_model',
    'pilotModel',
  ]) ?? 'Wofost72_PP';

  const completedAt = firstText(
    [root, result, resultResult],
    [
      'completed_at',
      'completedAt',
      'generated_at',
      'generatedAt',
    ],
  );

  const message = firstText(
    [root, result, resultResult],
    [
      'message',
      'note',
      'summary',
    ],
  );

  return {
    rawStage,
    dvs,
    model,
    completedAt,
    message,
  };
}

export async function fetchPcsePhenologyEvidence(
  fieldId: string | number,
): Promise<PcsePhenologyEvidence> {
  const normalizedFieldId = String(fieldId ?? '').trim();
  if (!normalizedFieldId) {
    throw new Error('PCSE fenoloji kanıtı için tarla kimliği bulunamadı.');
  }

  if (!supabase) {
    throw new Error('PCSE fenoloji kanıtı servisine bağlanılamadı.');
  }

  /*
    Yeni Supabase Function oluşturmuyoruz.
    Önce mevcut pcse-pilot-inputs ile gerçek girdilerin hazır olup olmadığını
    kontrol ediyor, sonra yine mevcut canlı pcse-pilot-run fonksiyonunu çağırıyoruz.
  */
  const { data: inputData, error: inputError } = await supabase.functions.invoke(
    'pcse-pilot-inputs',
    {
      body: { field_id: normalizedFieldId },
    },
  );

  if (inputError) throw inputError;
  if (!inputData?.ok) {
    throw new Error(
      String(
        inputData?.error ??
        inputData?.message ??
        'PCSE/WOFOST gerçek girdileri hazırlanamadı.',
      ),
    );
  }

  const inputMissing = normalizeMissingInputs(inputData?.missing_inputs);
  if (inputData?.ready !== true) {
    return {
      status: 'blocked',
      engine: 'pcse-wofost',
      model: 'Wofost72_PP',
      productionAuthority: false,
      waterStressAuthority: false,
      rawStage: null,
      canonicalStage: null,
      dvs: null,
      completedAt: null,
      missingInputs: inputMissing,
      runId: null,
      message: textOrNull(inputData?.note) ??
        (inputMissing.length
          ? `PCSE/WOFOST pilotu ${inputMissing.length} gerçek girdi eksik olduğu için bekliyor.`
          : 'PCSE/WOFOST pilotu gerekli gerçek girdiler tamamlanana kadar bekliyor.'),
    };
  }

  const { data, error } = await supabase.functions.invoke(
    'pcse-pilot-run',
    {
      body: { field_id: normalizedFieldId },
    },
  );

  if (error) throw error;
  if (!data?.ok) {
    if (data?.blocked === true) {
      const missingInputs = normalizeMissingInputs(data?.missing_inputs);

      return {
        status: 'blocked',
        engine: 'pcse-wofost',
        model: 'Wofost72_PP',
        productionAuthority: false,
        waterStressAuthority: false,
        rawStage: null,
        canonicalStage: null,
        dvs: null,
        completedAt: textOrNull(data?.completed_at),
        missingInputs,
        runId: textOrNull(data?.run_id),
        message: textOrNull(data?.note) ??
          (missingInputs.length
            ? `PCSE/WOFOST pilotu ${missingInputs.length} gerçek girdi eksik olduğu için bekliyor.`
            : 'PCSE/WOFOST pilotu gerekli gerçek girdiler tamamlanana kadar bekliyor.'),
      };
    }

    throw new Error(
      String(
        data?.error ??
        data?.message ??
        'PCSE/WOFOST pilot koşusu alınamadı.',
      ),
    );
  }

  if (data?.blocked === true) {
    const missingInputs = normalizeMissingInputs(data?.missing_inputs);

    return {
      status: 'blocked',
      engine: 'pcse-wofost',
      model: 'Wofost72_PP',
      productionAuthority: false,
      waterStressAuthority: false,
      rawStage: null,
      canonicalStage: null,
      dvs: null,
      completedAt: textOrNull(data?.completed_at),
      missingInputs,
      runId: textOrNull(data?.run_id),
      message: textOrNull(data?.note) ??
        'PCSE/WOFOST pilotu gerçek girdiler tamamlanana kadar bekliyor.',
    };
  }

  const parsed = extractPcseRunResult(data);
  const rawStage = parsed.rawStage;
  const status: PcsePhenologyEvidence['status'] = rawStage
    ? 'ready'
    : data?.result
      ? 'partial'
      : normalizeStatus(data?.status);

  return {
    status,
    engine: 'pcse-wofost',
    model: parsed.model,
    productionAuthority: false,
    waterStressAuthority: false,
    rawStage,
    canonicalStage: canonicalPcseStage(rawStage),
    dvs: parsed.dvs,
    completedAt: textOrNull(data?.completed_at) ?? parsed.completedAt,
    missingInputs: normalizeMissingInputs(data?.missing_inputs),
    runId: textOrNull(data?.run_id),
    message: parsed.message ??
      (rawStage
        ? 'PCSE/WOFOST pilot gelişim kanıtı hazır.'
        : 'PCSE/WOFOST pilotu tamamlandı ancak evre alanı okunamadı; production fenoloji sonucu değiştirilmedi.'),
  };
}

function stageRank(stage: PhenologyStage) {
  switch (stage) {
    case 'pre_sowing': return -1;
    case 'establishment': return 0;
    case 'vegetative': return 1;
    case 'reproductive':
    case 'flowering': return 2;
    case 'maturation':
    case 'fruit_set':
    case 'fruit_growth':
    case 'veraison': return 3;
    case 'harvest_window': return 4;
    case 'post_harvest': return 5;
    default: return null;
  }
}

function evidenceLine(evidence: PcsePhenologyEvidence) {
  const stage = evidence.rawStage ?? 'evre okunamadı';
  const dvs = evidence.dvs !== null
    ? ` · DVS ${evidence.dvs.toFixed(2)}`
    : '';

  return `PCSE/WOFOST pilot (${evidence.model}): ${stage}${dvs}`;
}

function withUnique(values: string[]) {
  return [...new Set(values.map((item) => String(item ?? '').trim()).filter(Boolean))];
}

/**
 * PCSE/WOFOST bir pilot/supporting motordur.
 * Production fenoloji otoritesi değildir; tek başına nihai evre yaratamaz.
 */
export function fusePhenologyWithPcse(
  base: PhenologyResult | null | undefined,
  pcse: PcsePhenologyEvidence | null | undefined,
): PhenologyResult | null {
  if (!base) return null;

  if (
    !pcse ||
    pcse.status !== 'ready' ||
    !pcse.canonicalStage
  ) {
    return base;
  }

  const line = evidenceLine(pcse);
  const basis = withUnique([
    ...base.basis,
    line,
    'PCSE/WOFOST destekleyici pilot kanıtıdır; production fenoloji otoritesi TarlaPusula Fenoloji Motoru olarak kalır.',
  ]);

  if (
    base.dataStatus !== 'usable' ||
    base.stage === 'unknown'
  ) {
    return {
      ...base,
      basis,
      warnings: withUnique([
        ...base.warnings,
        'PCSE/WOFOST pilot kanıtı mevcut ancak tek başına nihai fenoloji evresi üretmedi.',
      ]),
    };
  }

  if (base.stage === 'post_harvest') {
    return {
      ...base,
      basis,
    };
  }

  const baseRank = stageRank(base.stage);
  const pcseRank = stageRank(pcse.canonicalStage);

  if (baseRank === null || pcseRank === null) {
    return {
      ...base,
      basis,
    };
  }

  const distance = Math.abs(baseRank - pcseRank);
  const sameStage = base.stage === pcse.canonicalStage;

  if (distance <= 1) {
    const confidence = sameStage && base.confidence === 'low'
      ? 'medium'
      : base.confidence;

    return {
      ...base,
      confidence,
      basis: withUnique([
        ...basis,
        sameStage
          ? 'Model çapraz kontrolü: PCSE/WOFOST mevcut genel gelişim evresini destekliyor.'
          : 'Model çapraz kontrolü: PCSE/WOFOST yakın bir gelişim fazı gösteriyor.',
      ]),
      summary: sameStage
        ? `${base.summary} PCSE/WOFOST pilotu da aynı genel gelişim evresini destekliyor.`
        : `${base.summary} PCSE/WOFOST pilotu yakın bir gelişim fazı gösteriyor; production evre değiştirilmeden birlikte izleniyor.`,
    };
  }

  return {
    ...base,
    confidence:
      base.confidence === 'high'
        ? 'medium'
        : base.confidence,
    basis,
    warnings: withUnique([
      ...base.warnings,
      `PCSE/WOFOST pilotu “${pcse.rawStage ?? pcse.canonicalStage}” ile farklı bir genel gelişim fazı gösteriyor; supporting model production fenoloji evresini değiştirmedi.`,
    ]),
  };
}
