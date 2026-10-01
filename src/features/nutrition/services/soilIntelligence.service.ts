import type { SoilAnalysisRecord } from '../../../lib/soilAnalysisService';
import type { SoilGridsProfile } from '../../../services/soilGridsService';
import type {
  NutritionIntelligenceDecision,
  NutritionIntelligenceResponse,
} from './nutritionIntelligence.service';

export type SoilIntelligenceStatus =
  | 'lab-backed'
  | 'context-only'
  | 'empty'
  | 'loading'
  | 'error';

export type SoilIntelligenceResult = {
  status: SoilIntelligenceStatus;
  laboratoryAuthority: boolean;
  soilGridsContextAvailable: boolean;
  sourceModel: string;
  evidence: string[];
  warnings: string[];
  labAnalysisId: string | null;
  soilGridsGeneratedAt: string | null;
  productionAuthority?: boolean;
  authorityBasis?: 'laboratory' | 'soilgrids_context' | 'insufficient';
  serverDecision?: NutritionIntelligenceDecision | null;
  serverGeneratedAt?: string | null;
  recentFertilizationCount?: number;
  phenologyStageLabel?: string | null;
};

function finite(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function soilGridsEvidence(profile: SoilGridsProfile | null | undefined) {
  if (!profile) return [];

  const evidence = [
    `SoilGrids ${profile.spatialResolutionMeters} m model tahmini arka plan verisi olarak hazır.`,
  ];
  const ph = finite(profile.properties.ph.topsoil0To30);
  const organicCarbon = finite(profile.properties.organicCarbon.topsoil0To30);
  const clay = finite(profile.texture.clayPercent);
  const sand = finite(profile.texture.sandPercent);
  const silt = finite(profile.texture.siltPercent);

  if (ph != null) evidence.push(`SoilGrids 0–30 cm pH tahmini: ${ph.toFixed(1)}.`);
  if (organicCarbon != null) {
    evidence.push(
      `SoilGrids 0–30 cm organik karbon tahmini: ${organicCarbon.toFixed(1)} ${profile.properties.organicCarbon.unit}.`,
    );
  }
  if (clay != null || sand != null || silt != null) {
    const parts = [
      clay != null ? `kil %${clay.toFixed(0)}` : '',
      sand != null ? `kum %${sand.toFixed(0)}` : '',
      silt != null ? `silt %${silt.toFixed(0)}` : '',
    ].filter(Boolean);
    evidence.push(`SoilGrids tekstür bağlamı: ${parts.join(' · ')}.`);
  }

  return evidence;
}

function compact(values: Array<string | null | undefined>, limit = 8) {
  return [...new Set(values.map((item) => String(item ?? '').trim()).filter(Boolean))]
    .slice(0, limit);
}

/**
 * Sunucu-side soil-nutrition-engine çıktısını uygulamanın ortak toprak bağlamına
 * çevirir. Production otoritesi yalnız sunucu kararıdır; istemci burada yeni
 * besin eşiği veya gübre dozu hesaplamaz.
 */
export function buildServerSoilIntelligence(
  server: NutritionIntelligenceResponse,
  latestAnalysis: SoilAnalysisRecord | null,
): SoilIntelligenceResult {
  const decision = server.nutrition;
  const labBacked = decision.authority_basis === 'laboratory';
  const soilGridsReady = server.soilgrids?.available === true;

  const status: SoilIntelligenceStatus = labBacked
    ? 'lab-backed'
    : decision.authority_basis === 'soilgrids_context'
      ? 'context-only'
      : 'empty';

  const conflictWarnings = (server.conflicts ?? [])
    .map((item) => String(item?.note ?? '').trim())
    .filter(Boolean);

  return {
    status,
    laboratoryAuthority: labBacked,
    soilGridsContextAvailable: soilGridsReady,
    sourceModel: 'soil-nutrition-engine:server-v1',
    evidence: compact([
      labBacked
        ? 'Bu tarlaya ait laboratuvar toprak analizi production besin kararının ana ölçüm dayanağıdır.'
        : null,
      soilGridsReady
        ? 'SoilGrids model tahmini yalnız arka plan bağlamı olarak kullanılıyor; laboratuvar yerine geçmiyor.'
        : null,
      decision.headline,
      decision.summary,
      server.recent_fertilization_count > 0
        ? `Son kayıtlarda ${server.recent_fertilization_count} gübreleme işlemi besin bağlamına dahil edildi.`
        : null,
      server.phenology_context?.stage_label
        ? `Güncel fenoloji bağlamı: ${server.phenology_context.stage_label}.`
        : null,
    ]),
    warnings: compact([
      ...conflictWarnings,
      decision.authority_basis !== 'laboratory'
        ? 'Laboratuvar analizi olmadan sayısal gübre dozu üretilmez.'
        : null,
    ], 5),
    labAnalysisId: latestAnalysis?.id ?? server.laboratory?.id ?? null,
    soilGridsGeneratedAt: server.soilgrids?.generated_at ?? null,
    productionAuthority: true,
    authorityBasis: decision.authority_basis,
    serverDecision: decision,
    serverGeneratedAt: server.generated_at,
    recentFertilizationCount: server.recent_fertilization_count ?? 0,
    phenologyStageLabel: server.phenology_context?.stage_label ?? null,
  };
}

/**
 * Yerel fallback. Laboratuvar verisi ölçüm otoritesidir. SoilGrids yalnız
 * mekânsal/model arka planıdır; gübreleme reçetesi veya laboratuvar ölçümü
 * yerine geçmez.
 */
export function buildSoilIntelligence(input: {
  latestAnalysis: SoilAnalysisRecord | null;
  soilGridsProfile: SoilGridsProfile | null;
  soilGridsStatus?: 'idle' | 'loading' | 'ready' | 'error';
}): SoilIntelligenceResult {
  const analysis = input.latestAnalysis;
  const profile = input.soilGridsProfile;
  const soilReady = input.soilGridsStatus === 'ready' && Boolean(profile);
  const evidence = [
    ...(analysis ? ['Bu tarlaya ait laboratuvar toprak analizi mevcut.'] : []),
    ...soilGridsEvidence(soilReady ? profile : null),
  ];
  const warnings = [
    ...(profile?.warnings ?? []).slice(0, 2),
    ...(soilReady
      ? ['SoilGrids değerleri model tahminidir; laboratuvar ölçümü olarak kullanılmaz.']
      : []),
  ];

  if (analysis) {
    return {
      status: 'lab-backed',
      laboratoryAuthority: true,
      soilGridsContextAvailable: soilReady,
      sourceModel: soilReady
        ? 'soil-intelligence:lab+soilgrids-context'
        : 'soil-intelligence:lab',
      evidence,
      warnings,
      labAnalysisId: analysis.id,
      soilGridsGeneratedAt: soilReady ? profile?.generatedAt ?? null : null,
      productionAuthority: false,
      authorityBasis: 'laboratory',
      serverDecision: null,
    };
  }

  if (soilReady) {
    return {
      status: 'context-only',
      laboratoryAuthority: false,
      soilGridsContextAvailable: true,
      sourceModel: 'soil-intelligence:soilgrids-context',
      evidence,
      warnings,
      labAnalysisId: null,
      soilGridsGeneratedAt: profile?.generatedAt ?? null,
      productionAuthority: false,
      authorityBasis: 'soilgrids_context',
      serverDecision: null,
    };
  }

  if (input.soilGridsStatus === 'loading') {
    return {
      status: 'loading',
      laboratoryAuthority: false,
      soilGridsContextAvailable: false,
      sourceModel: 'soil-intelligence',
      evidence: [],
      warnings: [],
      labAnalysisId: null,
      soilGridsGeneratedAt: null,
      productionAuthority: false,
      serverDecision: null,
    };
  }

  if (input.soilGridsStatus === 'error') {
    return {
      status: 'error',
      laboratoryAuthority: false,
      soilGridsContextAvailable: false,
      sourceModel: 'soil-intelligence',
      evidence: [],
      warnings: [
        'SoilGrids arka planı alınamadı; laboratuvar verisi varsa karar akışı yine çalışır.',
      ],
      labAnalysisId: null,
      soilGridsGeneratedAt: null,
      productionAuthority: false,
      serverDecision: null,
    };
  }

  return {
    status: 'empty',
    laboratoryAuthority: false,
    soilGridsContextAvailable: false,
    sourceModel: 'soil-intelligence',
    evidence: [],
    warnings: [],
    labAnalysisId: null,
    soilGridsGeneratedAt: null,
    productionAuthority: false,
    authorityBasis: 'insufficient',
    serverDecision: null,
  };
}
