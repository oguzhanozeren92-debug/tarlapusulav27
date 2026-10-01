import { supabase } from '../supabaseClient';
import {
  compactPhiBaseEvidence,
  fetchPhiBaseFieldEvidence,
  type PhiBaseFieldEvidence,
} from '../features/knowledge/services/phibaseEvidence';
import {
  compactWorldCerealReference,
  fetchWorldCerealReferenceContext,
  type WorldCerealReferenceContext,
} from './worldCerealReference.service';
import {
  compactAgroClimateForPusula,
  fetchAgroClimateBaselineEvidence,
  type AgroClimateBaselineEvidence,
} from './agroClimateBaseline.service';
import {
  compactRiskClimateForPusula,
  fetchRiskClimateIntelligence,
} from '../features/risk-climate/services/riskClimateIntelligence.service';
import type { RiskClimateIntelligence } from '../features/risk-climate/types/riskClimateIntelligence';
import {
  compactRegionalPestDiseaseContext,
  fetchRegionalPestDiseaseContext,
} from '../features/regional-risk/services/regionalPestDiseaseRadar.service';
import type { RegionalPestDiseaseContext } from '../features/regional-risk/types/regionalPestDisease';

export type RiskRadarLevel =
  | 'low'
  | 'moderate'
  | 'high'
  | 'critical';

export type RiskRadarTrend =
  | 'rising'
  | 'stable'
  | 'falling';

export type RiskRadarThreat = {
  scientificName: string;
  commonName: string;
  displayName: string;
  threatType: string;
  model: string;
  score: number;
  level: RiskRadarLevel;
  levelLabel: string;
  peakScore7d: number;
  peakLevel7d: RiskRadarLevel;
  peakLevelLabel7d: string;
  peakDate: string | null;
  trend: RiskRadarTrend;
  reasons: string[];
  metrics: {
    temperatureAvgC: number;
    relativeHumidityMaxPercent: number;
    precipitation3dMm: number;
    leafWetnessHours: number;
    humidityStreakDays: number;
    vpdKpa: number | null;
    cumulativeGdd: number | null;
    phenologyFactor: number;
  } | null;
  timeline7d: Array<{
    date: string;
    score: number;
    level: RiskRadarLevel;
    levelLabel: string;
  }>;
  action: string;
};

export type RiskRadarIntelligenceDecisionStatus =
  | 'no_signal'
  | 'watch'
  | 'elevated'
  | 'field_evidence'
  | 'conflict'
  | 'unsupported_model'
  | 'needs_data';

export type RiskRadarIntelligence = {
  status: 'ready' | 'partial' | 'needs_data';
  decisionStatus: RiskRadarIntelligenceDecisionStatus;
  confidence: 'low' | 'medium' | 'high' | 'unknown';
  topThreat: string | null;
  topThreatType: string | null;
  riskScore: number | null;
  riskLevel: RiskRadarLevel | 'unknown';
  headline: string;
  summary: string;
  action: string;
  diagnosisAuthority: false;
  photoEvidence?: {
    issue_type?: string | null;
    status?: string | null;
    severity?: string | null;
    possible_issue?: string | null;
    confidence_percent?: number | null;
    observations?: string[];
    recommendations?: string[];
    needs_more_evidence?: boolean;
    requested_evidence?: string | null;
    trend?: string | null;
    disclaimer?: string | null;
    updated_at?: string | null;
  } | null;
  fieldObservations?: {
    active_point_count?: number;
    worsening_point_count?: number;
    improving_point_count?: number;
    interpretation?: string | null;
  } | null;
  phenologyContext?: {
    stage?: string | null;
    stage_label?: string | null;
    confidence?: string | null;
    authority_basis?: string | null;
    summary?: string | null;
    generated_at?: string | null;
  } | null;
  satelliteContext?: {
    status?: string | null;
    summary?: string | null;
    generatedAt?: string | null;
  } | null;
  knowledgeContext?: {
    guide_count?: number;
    role?: string;
  } | null;
  referenceContext?: {
    agml_reference_count?: number;
    role?: string;
  } | null;
  conflicts?: Array<{
    type?: string;
    note?: string;
    [key: string]: unknown;
  }>;
  missingInputs?: string[];
  generatedAt: string;
};

export type RiskRadarResult = {
  ok: boolean;
  supported: boolean;
  field?: {
    id: string;
    name: string;
    crop: string | null;
    normalizedCrop?: string;
  };
  location?: {
    latitude: number;
    longitude: number;
    source: string;
    precision: string;
  };
  seasonStartDate?: string;
  weather?: {
    source: string;
    timezone: string;
    timezoneAbbreviation: string;
    elevationM: number | null;
    pastDays: number;
    forecastDays: number;
  };
  overall?: {
    score: number;
    level: RiskRadarLevel;
    levelLabel: string;
    headline: string;
    recommendation: string;
  };
  threats: RiskRadarThreat[];
  intelligence?: RiskRadarIntelligence | null;
  intelligenceSnapshotId?: string | null;
  intelligenceGeneratedAt?: string | null;
  reason?: string;
  supportedCrops?: string[];
  worldCerealReference?: WorldCerealReferenceContext | null;
  phibaseEvidence?: PhiBaseFieldEvidence | null;
  agroClimateBaseline?: AgroClimateBaselineEvidence | null;
  climateIntelligence?: RiskClimateIntelligence | null;
  regionalPestDisease?: RegionalPestDiseaseContext | null;
  provenance?: {
    engine: string;
    upstream: string;
    upstreamLicense: string;
    upstreamCatalogSha: string;
    fuzzyEngineSha: string;
    weatherProvider: string;
    note: string;
  };
  generatedAt: string;
};

export type FetchRiskRadarOptions = {
  seasonStartDate?: string | null;
  forceRefresh?: boolean;
};

type CachedRiskRadar = {
  savedAt: number;
  result: RiskRadarResult;
};

const MEMORY_CACHE = new Map<string, CachedRiskRadar>();
const CACHE_PREFIX = 'tp_risk_radar_v3:';
const CACHE_MS = 30 * 60 * 1000;

function todayLocalIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function cleanDate(value: string | null | undefined) {
  const text = String(value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? text
    : null;
}

function cacheKey(
  fieldId: string,
  seasonStartDate?: string | null,
) {
  return [
    fieldId,
    cleanDate(seasonStartDate) ?? 'auto',
    todayLocalIso(),
  ].join(':');
}

function readCached(key: string) {
  const memory = MEMORY_CACHE.get(key);

  if (
    memory &&
    Date.now() - memory.savedAt < CACHE_MS
  ) {
    return memory.result;
  }

  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(
      `${CACHE_PREFIX}${key}`,
    );

    if (!raw) return null;

    const parsed = JSON.parse(raw) as CachedRiskRadar;

    if (
      !parsed?.savedAt ||
      !parsed?.result ||
      Date.now() - parsed.savedAt >= CACHE_MS
    ) {
      return null;
    }

    MEMORY_CACHE.set(key, parsed);
    return parsed.result;
  } catch {
    return null;
  }
}

function writeCached(
  key: string,
  result: RiskRadarResult,
) {
  const value: CachedRiskRadar = {
    savedAt: Date.now(),
    result,
  };

  MEMORY_CACHE.set(key, value);

  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      `${CACHE_PREFIX}${key}`,
      JSON.stringify(value),
    );
  } catch {
    // Cache yalnızca optimizasyon.
  }
}

async function readFunctionError(error: any) {
  try {
    const context = error?.context;

    if (context instanceof Response) {
      const text = await context.clone().text();

      if (text) {
        try {
          const parsed = JSON.parse(text);

          if (
            typeof parsed?.error === 'string' &&
            parsed.error.trim()
          ) {
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

  return (
    error?.message ||
    'Pusula Risk Radarı çağrısı başarısız oldu.'
  );
}

export async function fetchFieldRiskRadar(
  fieldId: string | number,
  options: FetchRiskRadarOptions = {},
): Promise<RiskRadarResult> {
  if (!supabase) {
    throw new Error(
      'Pusula Risk Radarı bağlantısı hazır değil.',
    );
  }

  const normalizedFieldId = String(fieldId ?? '').trim();

  if (!normalizedFieldId) {
    throw new Error(
      'Pusula Risk Radarı için tarla seçilmedi.',
    );
  }

  const key = cacheKey(
    normalizedFieldId,
    options.seasonStartDate,
  );

  if (!options.forceRefresh) {
    const cached = readCached(key);
    if (cached) return cached;
  }

  const { data, error } =
    await supabase.functions.invoke(
      'satellite-health',
      {
        body: {
          mode: 'risk',
          field_id: normalizedFieldId,
          seasonStartDate:
            cleanDate(options.seasonStartDate) ??
            undefined,
        },
      },
    );

  if (error) {
    throw new Error(
      await readFunctionError(error),
    );
  }

  if (!data) {
    throw new Error(
      'Pusula Risk Radarı boş yanıt döndürdü.',
    );
  }

  if (data.ok === false) {
    throw new Error(
      data.error ||
        'Pusula Risk Radarı hesabı oluşturulamadı.',
    );
  }

  const result: RiskRadarResult = {
    ...data,
    ok: true,
    supported: data.supported === true,
    threats: Array.isArray(data.threats)
      ? data.threats
      : [],
    intelligence:
      data.intelligence &&
      typeof data.intelligence === 'object'
        ? data.intelligence
        : null,
    intelligenceSnapshotId:
      typeof data.intelligenceSnapshotId === 'string'
        ? data.intelligenceSnapshotId
        : null,
    intelligenceGeneratedAt:
      typeof data.intelligenceGeneratedAt === 'string'
        ? data.intelligenceGeneratedAt
        : null,
    generatedAt:
      String(data.generatedAt ?? '') ||
      new Date().toISOString(),
  };

  const latitude = Number(result.location?.latitude);
  const longitude = Number(result.location?.longitude);

  const worldCerealPromise =
    Number.isFinite(latitude) && Number.isFinite(longitude)
      ? fetchWorldCerealReferenceContext(
          latitude,
          longitude,
          {
            radiusKm: 15,
            forceRefresh: options.forceRefresh,
          },
        )
      : Promise.resolve(null);

  const phibasePromise = fetchPhiBaseFieldEvidence(
    normalizedFieldId,
    {
      forceRefresh: options.forceRefresh,
    },
  );

  const agroClimatePromise = fetchAgroClimateBaselineEvidence(
    normalizedFieldId,
    {
      forceRefresh: options.forceRefresh,
    },
  );

  const [worldCerealResult, phibaseResult, agroClimateResult] =
    await Promise.allSettled([
      worldCerealPromise,
      phibasePromise,
      agroClimatePromise,
    ]);

  if (worldCerealResult.status === 'fulfilled') {
    result.worldCerealReference = worldCerealResult.value;
  } else {
    console.warn(
      '[Pusula] WorldCereal RDM bağlamı alınamadı:',
      worldCerealResult.reason,
    );
    result.worldCerealReference = null;
  }

  if (phibaseResult.status === 'fulfilled') {
    result.phibaseEvidence = phibaseResult.value;
  } else {
    console.warn(
      '[Pusula] PHI-base kanıtı alınamadı:',
      phibaseResult.reason,
    );
    result.phibaseEvidence = null;
  }

  if (agroClimateResult.status === 'fulfilled') {
    result.agroClimateBaseline = agroClimateResult.value;
  } else {
    console.warn(
      '[Pusula] CHIRPS / ERA5-Land agroiklim bağlamı alınamadı:',
      agroClimateResult.reason,
    );
    result.agroClimateBaseline = null;
  }

  try {
    result.regionalPestDisease = await fetchRegionalPestDiseaseContext(
      normalizedFieldId,
      { radiusKm: 75, lookbackDays: 21 },
    );
  } catch (error) {
    console.warn('[Pusula] Bölgesel hastalık/zararlı radarı bağlamı alınamadı:', error);
    result.regionalPestDisease = null;
  }

  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    try {
      const topThreat = result.threats[0] ?? null;
      result.climateIntelligence = await fetchRiskClimateIntelligence({
        fieldId: normalizedFieldId,
        latitude,
        longitude,
        agroClimate: result.agroClimateBaseline ?? null,
        diseaseRisk: {
          supported: result.supported,
          overallScore: result.overall?.score ?? null,
          overallLevel: result.overall?.level ?? null,
          headline: result.overall?.headline ?? null,
          topThreat: topThreat
            ? {
                name: topThreat.displayName,
                score: topThreat.score,
                level: topThreat.level,
                peakDate: topThreat.peakDate,
                reasons: topThreat.reasons,
                action: topThreat.action,
              }
            : null,
        },
        cropName: result.field?.crop ?? null,
        phenology: result.intelligence?.phenologyContext
          ? {
              stage: result.intelligence.phenologyContext.stage ?? null,
              stageLabel: result.intelligence.phenologyContext.stage_label ?? null,
              confidence: result.intelligence.phenologyContext.confidence ?? null,
            }
          : null,
        forceRefresh: options.forceRefresh,
      });
    } catch (error) {
      console.warn('[Pusula] Risk & İklim Zekâsı bağlamı alınamadı:', error);
      result.climateIntelligence = null;
    }
  } else {
    result.climateIntelligence = null;
  }

  writeCached(key, result);

  return result;
}

export function compactRiskRadarForPusula(
  result: RiskRadarResult | null | undefined,
) {
  if (!result) return null;

  const worldCerealReference =
    compactWorldCerealReference(
      result.worldCerealReference,
    );

  const phibaseEvidence = compactPhiBaseEvidence(
    result.phibaseEvidence,
  );

  const agroClimateBaseline = compactAgroClimateForPusula(
    result.agroClimateBaseline,
  );

  const climateIntelligence = compactRiskClimateForPusula(
    result.climateIntelligence,
  );

  const regionalPestDisease = compactRegionalPestDiseaseContext(
    result.regionalPestDisease,
  );

  const intelligence = result.intelligence
    ? {
        status: result.intelligence.status,
        decisionStatus:
          result.intelligence.decisionStatus,
        confidence:
          result.intelligence.confidence,
        topThreat:
          result.intelligence.topThreat,
        topThreatType:
          result.intelligence.topThreatType,
        riskScore:
          result.intelligence.riskScore,
        riskLevel:
          result.intelligence.riskLevel,
        headline:
          result.intelligence.headline,
        summary:
          result.intelligence.summary,
        action:
          result.intelligence.action,
        diagnosisAuthority: false as const,
        photoEvidence:
          result.intelligence.photoEvidence
            ? {
                issueType:
                  result.intelligence.photoEvidence.issue_type ??
                  null,
                status:
                  result.intelligence.photoEvidence.status ??
                  null,
                severity:
                  result.intelligence.photoEvidence.severity ??
                  null,
                possibleIssue:
                  result.intelligence.photoEvidence.possible_issue ??
                  null,
                confidencePercent:
                  result.intelligence.photoEvidence.confidence_percent ??
                  null,
                trend:
                  result.intelligence.photoEvidence.trend ??
                  null,
                needsMoreEvidence:
                  result.intelligence.photoEvidence.needs_more_evidence ??
                  false,
              }
            : null,
        fieldObservations:
          result.intelligence.fieldObservations ?? null,
        phenologyContext:
          result.intelligence.phenologyContext ?? null,
        satelliteContext:
          result.intelligence.satelliteContext ?? null,
        knowledgeContext:
          result.intelligence.knowledgeContext ?? null,
        referenceContext:
          result.intelligence.referenceContext ?? null,
        conflicts:
          result.intelligence.conflicts ?? [],
        missingInputs:
          result.intelligence.missingInputs ?? [],
        generatedAt:
          result.intelligence.generatedAt,
      }
    : null;

  if (!result.supported) {
    return {
      supported: false,
      crop: result.field?.crop ?? null,
      reason:
        result.reason ??
        'Bu ürün için doğrulanmış çevresel risk modeli henüz yok.',
      intelligence,
      worldCerealReference,
      phibaseEvidence,
      agroClimateBaseline,
      climateIntelligence,
      regionalPestDisease,
      generatedAt: result.generatedAt,
    };
  }

  return {
    supported: true,
    fieldId: result.field?.id ?? null,
    crop: result.field?.crop ?? null,
    overall: result.overall ?? null,
    locationPrecision:
      result.location?.precision ?? null,
    topThreats: result.threats
      .slice(0, 3)
      .map((threat) => ({
        name: threat.displayName,
        score: threat.score,
        level: threat.level,
        peakScore7d: threat.peakScore7d,
        peakDate: threat.peakDate,
        trend: threat.trend,
        reasons: threat.reasons,
        action: threat.action,
      })),
    intelligence,
    worldCerealReference,
    phibaseEvidence,
    agroClimateBaseline,
    climateIntelligence,
    regionalPestDisease,
    provenance: result.provenance ?? null,
    generatedAt: result.generatedAt,
  };
}

export function clearRiskRadarCache(
  fieldId?: string | number,
) {
  if (fieldId === undefined) {
    MEMORY_CACHE.clear();

    if (typeof window !== 'undefined') {
      const keys = Object.keys(window.localStorage);

      for (const key of keys) {
        if (key.startsWith(CACHE_PREFIX)) {
          window.localStorage.removeItem(key);
        }
      }
    }

    return;
  }

  const prefix = String(fieldId);

  for (const key of [...MEMORY_CACHE.keys()]) {
    if (key.startsWith(`${prefix}:`)) {
      MEMORY_CACHE.delete(key);
    }
  }

  if (typeof window !== 'undefined') {
    for (const key of Object.keys(window.localStorage)) {
      if (
        key.startsWith(
          `${CACHE_PREFIX}${prefix}:`,
        )
      ) {
        window.localStorage.removeItem(key);
      }
    }
  }
}
