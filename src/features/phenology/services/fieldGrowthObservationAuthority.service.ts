import { supabase } from '../../../supabaseClient';

import type {
  PhenologyConfidence,
  PhenologyResult,
  PhenologyStage,
} from '../types/phenology';

const DAY_MS = 86_400_000;
const AUTHORITY_MAX_AGE_DAYS = 21;
const CONTEXT_MAX_AGE_DAYS = 45;

export type FieldGrowthObservationAuthorityStatus =
  | 'authoritative'
  | 'context'
  | 'stale'
  | 'future'
  | 'unsupported';

export type FieldGrowthObservationEvidence = {
  id: string;
  fieldId: string;
  seasonId: string | null;
  observedOn: string;
  rawStage: string;
  canonicalStage: PhenologyStage | null;
  stageLabel: string | null;
  notes: string | null;
  createdAt: string | null;
  ageDays: number | null;
  status: FieldGrowthObservationAuthorityStatus;
  confidence: PhenologyConfidence;
  authoritative: boolean;
};

const CANONICAL_STAGES = new Set<PhenologyStage>([
  'unknown',
  'pre_sowing',
  'establishment',
  'vegetative',
  'reproductive',
  'maturation',
  'harvest_window',
  'post_harvest',
  'dormancy',
  'bud_swell',
  'bud_break',
  'flowering',
  'fruit_set',
  'fruit_growth',
  'veraison',
  'leaf_fall',
]);

function normalizeText(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[‐‑‒–—−]/g, '-')
    .replace(/\s+/g, ' ');
}

function stageLabel(stage: PhenologyStage | null) {
  switch (stage) {
    case 'pre_sowing': return 'Ekim Öncesi';
    case 'establishment': return 'Çıkış / Yerleşme';
    case 'vegetative': return 'Vejetatif Gelişim';
    case 'reproductive': return 'Üreme / Çiçeklenme-Dane Oluşumu';
    case 'maturation': return 'Olgunlaşma';
    case 'harvest_window': return 'Hasat Penceresi';
    case 'post_harvest': return 'Hasat Sonrası';
    case 'dormancy': return 'Kış Dinlenmesi';
    case 'bud_swell': return 'Tomurcuk Kabarması';
    case 'bud_break': return 'Tomurcuk Uyanması / Sürme';
    case 'flowering': return 'Çiçeklenme';
    case 'fruit_set': return 'Meyve Tutumu';
    case 'fruit_growth': return 'Meyve Gelişimi';
    case 'veraison': return 'Ben Düşme / Renklenme';
    case 'leaf_fall': return 'Yaprak Yaşlanması / Dökümü';
    default: return null;
  }
}

export function canonicalFieldGrowthStage(value: unknown): PhenologyStage | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  if (CANONICAL_STAGES.has(raw as PhenologyStage)) {
    const canonical = raw as PhenologyStage;
    return canonical === 'unknown' ? null : canonical;
  }

  const stage = normalizeText(raw);
  if (!stage) return null;

  if (/ekim oncesi|pre[- ]?sowing/.test(stage)) return 'pre_sowing';
  if (/hasat sonrasi|post[- ]?harvest|after harvest/.test(stage)) return 'post_harvest';
  if (/hasat penceresi|harvest window/.test(stage)) return 'harvest_window';
  if (/kis dinlen|dinlenme|dormancy|dormant/.test(stage)) return 'dormancy';
  if (/tomurcuk kabar|bud swell/.test(stage)) return 'bud_swell';
  if (/tomurcuk uyan|surme|bud break/.test(stage)) return 'bud_break';
  if (/meyve tut|fruit set/.test(stage)) return 'fruit_set';
  if (/meyve gelis|fruit growth/.test(stage)) return 'fruit_growth';
  if (/ben dus|renklen|veraison/.test(stage)) return 'veraison';
  if (/yaprak.*dok|leaf fall|senescence/.test(stage)) return 'leaf_fall';
  if (/olgun|matur|ripen|dane dol/.test(stage)) return 'maturation';
  if (/ureme|reproduct|basaklan|anthesis|dane olus/.test(stage)) return 'reproductive';
  if (/ciceklen|flower/.test(stage)) return 'flowering';
  if (/vejetatif|vegetat|kardeslen|sapa kalk|leaf development/.test(stage)) return 'vegetative';
  if (/cikis|yerles|cimlen|establish|emerg|germin|ekim \/ dikim/.test(stage)) {
    return 'establishment';
  }
  if (/hasat|harvest/.test(stage)) return 'harvest_window';

  return null;
}

function parseDay(value: unknown) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!match) return null;
  const timestamp = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function referenceDay(value?: string | Date | null) {
  const date = value instanceof Date
    ? value
    : value
      ? new Date(value)
      : new Date();

  if (!Number.isFinite(date.getTime())) return Date.now();
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function authorityStatus(
  canonicalStage: PhenologyStage | null,
  ageDays: number | null,
): FieldGrowthObservationAuthorityStatus {
  if (!canonicalStage) return 'unsupported';
  if (ageDays === null) return 'unsupported';
  if (ageDays < 0) return 'future';
  if (ageDays <= AUTHORITY_MAX_AGE_DAYS) return 'authoritative';
  if (ageDays <= CONTEXT_MAX_AGE_DAYS) return 'context';
  return 'stale';
}

function observationConfidence(
  status: FieldGrowthObservationAuthorityStatus,
  ageDays: number | null,
): PhenologyConfidence {
  if (status !== 'authoritative') return 'low';
  if (ageDays !== null && ageDays <= 7) return 'high';
  return 'medium';
}

export async function fetchLatestFieldGrowthObservation(
  fieldIdInput: string,
  currentDate?: string | Date | null,
): Promise<FieldGrowthObservationEvidence | null> {
  const fieldId = String(fieldIdInput ?? '').trim();
  if (!fieldId) return null;

  const { data, error } = await supabase
    .from('field_growth_observations')
    .select('id, field_id, season_id, observed_on, stage, notes, created_at')
    .eq('field_id', fieldId)
    .order('observed_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const rawStage = String(data.stage ?? '').trim();
  const canonicalStage = canonicalFieldGrowthStage(rawStage);
  const observedDay = parseDay(data.observed_on);
  const ageDays = observedDay === null
    ? null
    : Math.floor((referenceDay(currentDate) - observedDay) / DAY_MS);
  const status = authorityStatus(canonicalStage, ageDays);
  const confidence = observationConfidence(status, ageDays);

  return {
    id: String(data.id),
    fieldId: String(data.field_id ?? fieldId),
    seasonId: data.season_id == null ? null : String(data.season_id),
    observedOn: String(data.observed_on ?? '').slice(0, 10),
    rawStage,
    canonicalStage,
    stageLabel: stageLabel(canonicalStage),
    notes: String(data.notes ?? '').trim() || null,
    createdAt: String(data.created_at ?? '').trim() || null,
    ageDays,
    status,
    confidence,
    authoritative: status === 'authoritative',
  };
}

function compactUnique(values: Array<string | null | undefined>, limit = 12) {
  return [...new Set(values.map((item) => String(item ?? '').trim()).filter(Boolean))]
    .slice(0, limit);
}

function observedBasis(observation: FieldGrowthObservationEvidence) {
  const label = observation.stageLabel ?? observation.rawStage;
  return `Saha gözlemi (${observation.observedOn}): ${label}`;
}

function contextualizeOnly(
  base: PhenologyResult | null | undefined,
  observation: FieldGrowthObservationEvidence,
  warning: string,
): PhenologyResult | null {
  if (!base) return null;
  return {
    ...base,
    warnings: compactUnique([
      ...(base.warnings ?? []),
      warning,
    ]),
  };
}

/**
 * Bilimsel otorite kuralı:
 * - Takvim / NASA Harvest / PCSE destekleyici kaynaklardır.
 * - Güncel ve tanınan saha gözlemi mevcut gelişim evresinde önceliklidir.
 * - Doğrulanmış hasat kaydı sezonu kapattıysa eski saha kaydı sezonu yeniden açamaz.
 * - Saha formundaki "post_harvest" seçimi tek başına gerçek hasat kaydı yerine geçmez.
 */
export function fusePhenologyWithFieldObservation(
  base: PhenologyResult | null | undefined,
  observation: FieldGrowthObservationEvidence | null | undefined,
): PhenologyResult | null {
  if (!observation) return base ?? null;

  if (observation.status === 'unsupported') {
    return contextualizeOnly(
      base,
      observation,
      `Saha gözlemindeki “${observation.rawStage || 'boş'}” evresi ortak fenoloji sözlüğüyle eşleştirilemedi.`,
    );
  }

  if (observation.status === 'future') {
    return contextualizeOnly(
      base,
      observation,
      `Saha gelişim gözlemi gelecekteki bir tarihe (${observation.observedOn}) ait görünüyor; mevcut evreyi değiştirmedi.`,
    );
  }

  if (observation.status === 'context' || observation.status === 'stale') {
    return contextualizeOnly(
      base,
      observation,
      `Son saha gelişim gözlemi ${observation.ageDays ?? '?'} günlük; geçmiş kanıt olarak tutuldu fakat mevcut evreyi tek başına değiştirmedi.`,
    );
  }

  const observedStage = observation.canonicalStage;
  if (!observedStage || !observation.authoritative) return base ?? null;

  if (observedStage === 'post_harvest' && base?.stage !== 'post_harvest') {
    return contextualizeOnly(
      base,
      observation,
      'Saha gözleminde hasat sonrası seçilmiş olsa da doğrulanmış hasat kaydı olmadan sezon kapatılmadı.',
    );
  }

  if (base?.stage === 'post_harvest' && observedStage !== 'post_harvest') {
    return contextualizeOnly(
      base,
      observation,
      'Doğrulanmış hasat kaydı mevcut olduğu için daha eski/çelişkili saha evresi sezonu yeniden açmadı.',
    );
  }

  const disagreement = Boolean(
    base &&
      base.dataStatus === 'usable' &&
      base.stage !== 'unknown' &&
      base.stage !== observedStage,
  );
  const label = observation.stageLabel ?? observation.rawStage;

  return {
    stage: observedStage,
    stageLabel: label,
    confidence: observation.confidence === 'high' ? 'high' : 'medium',
    dataStatus: 'usable',
    progressPercent: base?.progressPercent ?? null,
    daysSinceSowing: base?.daysSinceSowing ?? null,
    daysUntilExpectedHarvest: base?.daysUntilExpectedHarvest ?? null,
    basis: compactUnique([
      observedBasis(observation),
      ...(base?.basis ?? []),
    ]),
    warnings: compactUnique([
      ...(base?.warnings ?? []),
      disagreement
        ? `Saha gözlemi “${label}” evresini gösterirken takvim/uydu/model birleşimi “${base?.stageLabel ?? base?.stage}” gösteriyordu; mevcut evrede saha gözlemine öncelik verildi.`
        : null,
    ]),
    summary: disagreement
      ? `${observation.observedOn} tarihli saha gözlemi mevcut gelişim evresini “${label}” olarak doğruladı ve model tahmininin önüne geçti.`
      : `${observation.observedOn} tarihli saha gözlemi mevcut gelişim evresini “${label}” olarak doğruluyor.`,
  };
}

export function fieldObservationSignature(
  observation: FieldGrowthObservationEvidence | null | undefined,
) {
  if (!observation) return 'none';
  return [
    observation.id,
    observation.observedOn,
    observation.rawStage,
    observation.status,
    observation.confidence,
    observation.ageDays ?? 'na',
  ].join('|');
}
