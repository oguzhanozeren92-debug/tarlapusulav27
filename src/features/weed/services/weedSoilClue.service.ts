import { supabase } from '../../../supabaseClient';
import type { HomeDecisionEvent } from '../../decision/types/homeDecision';
import type { WeedIntelligenceSignal } from './weedIntelligence.service';

export type WeedSoilContext = {
  authorityBasis: 'laboratory' | 'soilgrids_context' | 'insufficient' | 'unavailable';
  laboratoryAvailable: boolean;
  labPh: number | null;
  soilGridsAvailable: boolean;
  soilGridsPh: number | null;
  clayPercent: number | null;
  sandPercent: number | null;
  siltPercent: number | null;
  organicCarbonGKg: number | null;
  generatedAt: string | null;
};

export type WeedSoilClueTheme =
  | 'compaction'
  | 'drainage'
  | 'high_ph'
  | 'fertility'
  | 'dry_compacted_tolerance';

export type WeedSoilClue = {
  candidate: string;
  scientificName: string;
  matchedAliases: string[];
  themes: WeedSoilClueTheme[];
  headline: string;
  summary: string;
  action: string;
  checks: string[];
  contextEvidence: string[];
  sourceEvidence: string[];
  confidence: 'medium' | 'preliminary';
  observedAt: string | null;
  sourceEventId: string | null;
};

type WeedEcologyProfile = {
  scientificName: string;
  aliases: string[];
  themes: WeedSoilClueTheme[];
  headline: string;
  ecology: string;
  checks: string[];
  sources: string[];
};

type NutritionSnapshotRow = {
  authority_basis?: unknown;
  lab_data?: unknown;
  soilgrids?: unknown;
  generated_at?: unknown;
};

const PROFILES: WeedEcologyProfile[] = [
  {
    scientificName: 'Plantago major',
    aliases: [
      'plantago major',
      'broadleaf plantain',
      'genis yaprakli sinir otu',
      'sinir otu',
      'sinir otu plantago',
    ],
    themes: ['compaction', 'drainage', 'high_ph'],
    headline: 'Sıkışma, drenaj ve pH bağlamını kontrol et',
    ecology:
      'Plantago major sıkışmış toprakları tolere edebilir; nemli alanlarda ve bazı kaynaklarda daha yüksek pH koşullarında da görülebilir.',
    checks: [
      'Kürek veya toprak sondasıyla kök bölgesinde sert/sıkışmış tabaka olup olmadığını kontrol et.',
      'Yağış veya sulama sonrası su birikmesi ve geç kuruyan noktaları kontrol et.',
      'Varsa laboratuvar pH sonucunu esas al; yoksa pH ölçümü planla.',
    ],
    sources: ['University of Minnesota Extension', 'Oregon State University Extension'],
  },
  {
    scientificName: 'Chenopodium album',
    aliases: [
      'chenopodium album',
      'common lambsquarters',
      'lambsquarters',
      "lamb's quarters",
      'sirken',
      'sirken otu',
    ],
    themes: ['fertility'],
    headline: 'Yüksek besin düzeyi olasılığını kayıtlarla karşılaştır',
    ecology:
      'Chenopodium album bazı üretim sistemlerinde besin maddelerince zengin alanlarda güçlü gelişebilir; tek başına yüksek gübre düzeyini kanıtlamaz.',
    checks: [
      'Son gübreleme kayıtlarını ve uygulama dağılımını kontrol et.',
      'Laboratuvar analizinde besin değerlerini esas al; yabancı ot varlığından doz sonucu çıkarma.',
    ],
    sources: ['Penn State Extension'],
  },
  {
    scientificName: 'Rumex crispus',
    aliases: [
      'rumex crispus',
      'curly dock',
      'curled dock',
      'kivircik labada',
      'labada',
    ],
    themes: ['drainage', 'fertility'],
    headline: 'Islak alan ve besin birikimi olasılığını kontrol et',
    ecology:
      'Rumex crispus nemli/ıslak ve verimli alanlarda avantaj kazanabilir; tür varlığı drenaj veya gübre fazlalığını tek başına doğrulamaz.',
    checks: [
      'Yağış/sulama sonrası uzun süre ıslak kalan veya su tutan bölge var mı kontrol et.',
      'Gübreleme geçmişi ile laboratuvar analizini birlikte incele.',
    ],
    sources: ['Penn State Extension'],
  },
  {
    scientificName: 'Polygonum aviculare',
    aliases: [
      'polygonum aviculare',
      'prostrate knotweed',
      'knotweed',
      'kusekmegi',
      'kus ekmegi',
    ],
    themes: ['compaction'],
    headline: 'Toprak sıkışması ve düşük havalanmayı kontrol et',
    ecology:
      'Prostrate knotweed sıkışmış, havalanması sınırlı zeminlerde avantaj sağlayabilir.',
    checks: [
      'Traktör izi, sıra arası ve tarla başı dönüş alanlarında sıkışmayı ayrı ayrı kontrol et.',
      'Kök derinliği, yüzey kabuklanması ve infiltrasyon hızında belirgin fark var mı bak.',
    ],
    sources: ['Oregon State University Extension'],
  },
  {
    scientificName: 'Cyperus spp.',
    aliases: [
      'cyperus',
      'cyperus spp',
      'nutsedge',
      'yellow nutsedge',
      'purple nutsedge',
      'sedge',
      'saz',
      'topalak',
    ],
    themes: ['drainage'],
    headline: 'Drenaj ve fazla sulama olasılığını kontrol et',
    ecology:
      'Sedge/Cyperus grubu bazı alanlarda yüksek nem, zayıf drenaj veya fazla sulamayla birlikte görülebilir.',
    checks: [
      'Sulama sonrası göllenme ve geç kuruyan zonları kontrol et.',
      'Sulama süresi/miktarı ile tarla eğimi ve drenaj noktalarını karşılaştır.',
    ],
    sources: ['Oregon State University Extension'],
  },
  {
    scientificName: 'Portulaca oleracea',
    aliases: [
      'portulaca oleracea',
      'common purslane',
      'purslane',
      'semizotu',
      'semiz otu',
    ],
    themes: ['fertility', 'dry_compacted_tolerance'],
    headline: 'Besin düzeyi ile kuru/sıkışmış yüzey koşullarını kontrol et',
    ecology:
      'Portulaca oleracea besince zengin alanlarda iyi gelişebilir ve kuru/sıkışmış koşullara dayanabilir; bu özellikler toprak ölçümü değildir.',
    checks: [
      'Son gübreleme kayıtları ile laboratuvar analizini karşılaştır.',
      'Yüzey kabuklanması, sıkışma ve hızlı kuruyan zonları sahada kontrol et.',
    ],
    sources: ['University of Minnesota Extension'],
  },
];

function normalized(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function nestedNumber(root: unknown, path: string[]): number | null {
  let current: unknown = root;
  for (const key of path) {
    current = object(current)[key];
  }
  return finite(current);
}

function labValue(extracted: unknown, keys: string[]) {
  const values = object(extracted);
  const normalizedEntries = new Map(
    Object.entries(values).map(([key, value]) => [normalized(key).replace(/\s/g, ''), value]),
  );
  for (const key of keys) {
    const direct = finite(values[key]);
    if (direct !== null) return direct;
    const candidate = finite(normalizedEntries.get(normalized(key).replace(/\s/g, '')));
    if (candidate !== null) return candidate;
  }
  return null;
}

function profileFor(candidate: string) {
  const key = normalized(candidate);
  if (!key) return null;
  return PROFILES.find((profile) =>
    profile.aliases.some((alias) => {
      const aliasKey = normalized(alias);
      return key === aliasKey || key.includes(aliasKey) || aliasKey.includes(key);
    }),
  ) ?? null;
}

function contextFromRow(row: NutritionSnapshotRow | null): WeedSoilContext {
  if (!row) {
    return {
      authorityBasis: 'unavailable',
      laboratoryAvailable: false,
      labPh: null,
      soilGridsAvailable: false,
      soilGridsPh: null,
      clayPercent: null,
      sandPercent: null,
      siltPercent: null,
      organicCarbonGKg: null,
      generatedAt: null,
    };
  }

  const labData = object(row.lab_data);
  const soilGrids = object(row.soilgrids);
  const soilGridsProperties = object(soilGrids.properties);
  const texture = object(soilGrids.texture);
  const extracted = labData.extracted_values;
  const authority = String(row.authority_basis ?? '');

  return {
    authorityBasis:
      authority === 'laboratory'
        ? 'laboratory'
        : authority === 'soilgrids_context'
          ? 'soilgrids_context'
          : 'insufficient',
    laboratoryAvailable: Boolean(String(labData.id ?? '').trim()),
    labPh: labValue(extracted, ['pH', 'ph', 'soil pH', 'soilpH']),
    soilGridsAvailable: Boolean(String(soilGrids.source ?? '').trim()),
    soilGridsPh: nestedNumber(soilGridsProperties, ['ph', 'topsoil0To30']),
    clayPercent: finite(texture.clayPercent),
    sandPercent: finite(texture.sandPercent),
    siltPercent: finite(texture.siltPercent),
    organicCarbonGKg: nestedNumber(soilGridsProperties, ['organicCarbon', 'topsoil0To30']),
    generatedAt: String(row.generated_at ?? '').trim() || null,
  };
}

export async function fetchLatestWeedSoilContext(fieldId: string): Promise<WeedSoilContext> {
  const normalizedFieldId = String(fieldId ?? '').trim();
  if (!normalizedFieldId) return contextFromRow(null);

  const { data, error } = await supabase
    .from('field_nutrition_intelligence_snapshots')
    .select('authority_basis,lab_data,soilgrids,generated_at')
    .eq('field_id', normalizedFieldId)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn('[TarlaPusula] yabancı ot → toprak bağlamı okunamadı:', error.message);
    return contextFromRow(null);
  }

  return contextFromRow((data as NutritionSnapshotRow | null) ?? null);
}

function soilContextEvidence(context: WeedSoilContext | null | undefined) {
  if (!context) return [];
  const evidence: string[] = [];

  if (context.laboratoryAvailable) {
    evidence.push(
      context.labPh !== null
        ? `Laboratuvar pH: ${context.labPh.toFixed(1)}. Ölçüm, yabancı ot ipucundan daha yüksek otoritededir.`
        : 'Bu tarla için laboratuvar toprak analizi var; production toprak kararında laboratuvar önceliklidir.',
    );
  } else if (context.soilGridsAvailable) {
    if (context.soilGridsPh !== null) {
      evidence.push(`SoilGrids pH model bağlamı: ${context.soilGridsPh.toFixed(1)}; laboratuvar ölçümü değildir.`);
    }
    const texture = [
      context.clayPercent !== null ? `kil %${Math.round(context.clayPercent)}` : '',
      context.sandPercent !== null ? `kum %${Math.round(context.sandPercent)}` : '',
      context.siltPercent !== null ? `silt %${Math.round(context.siltPercent)}` : '',
    ].filter(Boolean);
    if (texture.length) evidence.push(`SoilGrids tekstür bağlamı: ${texture.join(' · ')}.`);
    if (context.organicCarbonGKg !== null) {
      evidence.push(`SoilGrids organik karbon bağlamı: ${context.organicCarbonGKg.toFixed(1)} g/kg.`);
    }
  } else {
    evidence.push('Bu ipucunu doğrulayacak güncel laboratuvar/SoilGrids toprak bağlamı henüz yok.');
  }

  return evidence;
}

export function buildWeedSoilClue(
  signal: WeedIntelligenceSignal | null | undefined,
  context: WeedSoilContext | null | undefined,
): WeedSoilClue | null {
  if (
    !signal ||
    signal.status !== 'confirmed' ||
    signal.presence !== 'visible' ||
    signal.confidencePercent < 60 ||
    !signal.candidate ||
    normalized(signal.candidate) === 'belirsiz'
  ) {
    return null;
  }

  const profile = profileFor(signal.candidate);
  if (!profile) return null;

  const contextEvidence = soilContextEvidence(context);
  const candidate = signal.candidate.trim();
  const sourceEvidence = [
    `Saha fotoğrafındaki görsel tür adayı: ${candidate}.`,
    `Görsel aday güveni: %${Math.round(signal.confidencePercent)}.`,
    ...profile.sources.map((source) => `Ekolojik ilişki kaynağı: ${source}.`),
    'Yabancı ot türü yalnızca toprak koşuluna bakarak oluşmaz; bu sonuç ölçüm değil kontrol hipotezidir.',
  ];

  const measurementNote = context?.laboratoryAvailable
    ? 'Mevcut laboratuvar sonucunu esas alarak bu ekolojik ipucunu karşılaştır.'
    : context?.soilGridsAvailable
      ? 'SoilGrids yalnız model bağlamıdır; şüpheyi sahada veya laboratuvarla doğrula.'
      : 'Şüpheyi saha kontrolü ve gerekirse toprak analiziyle doğrula.';

  return {
    candidate,
    scientificName: profile.scientificName,
    matchedAliases: [...profile.aliases],
    themes: [...profile.themes],
    headline: profile.headline,
    summary: `${candidate} (${profile.scientificName}) görsel adayı için ${profile.ecology} Bu bir toprak teşhisi değildir.`,
    action: `${measurementNote} Yabancı ot ipucundan gübre, kireç, sulama veya kimyasal doz çıkarma.`,
    checks: [...profile.checks],
    contextEvidence,
    sourceEvidence,
    confidence: signal.confidencePercent >= 80 ? 'medium' : 'preliminary',
    observedAt: signal.observedAt,
    sourceEventId: signal.sourceEventId,
  };
}

export function buildWeedSoilDecision(
  fieldIdInput: string | number | null | undefined,
  clue: WeedSoilClue | null | undefined,
): HomeDecisionEvent | null {
  const fieldId = String(fieldIdInput ?? '').trim();
  if (!fieldId || !clue) return null;

  const key = clue.sourceEventId || clue.observedAt?.slice(0, 10) || 'latest';
  const evidence = [
    ...clue.sourceEvidence,
    ...clue.contextEvidence,
    ...clue.checks.map((check) => `Kontrol: ${check}`),
  ].slice(0, 12);

  return {
    signal: {
      status: 'ready',
      observedAt: clue.observedAt,
    },
    id: `weed-soil:${fieldId}:${key}`,
    group: 'weed-soil-clue',
    source: 'weed-intelligence',
    priority: 88,
    severity: 'info',
    target: 'soil',
    channels: ['pusula'],
    kind: 'check',
    label: 'TOPRAK İPUCU',
    title: clue.headline,
    detail: `${clue.summary} ${clue.action}`,
    evidence,
    confidence: clue.confidence,
    sourceModel: 'weed-soil-clue:extension-ecology+soil-context',
    today: {
      tone: 'gold',
      visual: 'spraying',
      iconKey: 'leaf-gold',
      iconClass: 'leaf',
    },
  };
}
