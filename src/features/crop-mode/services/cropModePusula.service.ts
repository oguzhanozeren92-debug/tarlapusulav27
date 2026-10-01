import type {
  CropModeKey,
  CropModeModule,
  CropModeRisk,
  CropModeRuntime,
} from '../types/cropMode';

const MODULE_LABELS: Record<CropModeModule, string> = {
  phenology: 'gelişim evresi',
  risk: 'riskler',
  irrigation: 'su ve sulama',
  nutrition: 'besleme',
  pest: 'hastalık ve zararlı',
  weed: 'yabancı ot',
  harvest: 'hasat',
  soil: 'toprak',
  satellite: 'uydu görünümü',
  weather: 'hava koşulları',
  market: 'piyasa',
};

const RISK_LABELS: Record<CropModeRisk, string> = {
  frost: 'don',
  heat: 'ısı stresi',
  drought: 'kuraklık',
  water_stress: 'su stresi',
  fungal_disease: 'mantari hastalık riski',
  pest: 'zararlı baskısı',
  weed_pressure: 'yabancı ot baskısı',
  lodging: 'yatma riski',
  harvest_weather: 'hasat hava koşulları',
};

type MapAnalysisLike = {
  headline?: string;
  summary?: string;
  action?: string;
  caution?: string;
  status?: string;
  confidence?: string;
  importantArea?: unknown;
  [key: string]: unknown;
};

type SynthesisLike = MapAnalysisLike & {
  likelyCauses?: Array<Record<string, any>>;
  evidence?: Array<Record<string, any>>;
};

export type CropModePusulaMeta = {
  modeKey: CropModeKey;
  modeLabel: string;
  subMode: CropModeRuntime['subMode'];
  runtimeTags: CropModeRuntime['runtimeTags'];
  priorityModules: CropModeModule[];
  priorityRisks: CropModeRisk[];
  focusLabel: string;
  guardrails: string[];
};

function clean(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function uniqueSentences(parts: Array<string | null | undefined>) {
  const out: string[] = [];
  for (const part of parts) {
    const value = clean(part);
    if (!value) continue;
    const normalized = value.toLocaleLowerCase('tr-TR');
    if (out.some((item) => item.toLocaleLowerCase('tr-TR') === normalized)) continue;
    out.push(value);
  }
  return out;
}

function topModuleLabels(mode: CropModeRuntime, count = 3) {
  return mode.priorityModules
    .slice(0, count)
    .map((item) => MODULE_LABELS[item])
    .filter(Boolean);
}

function topRiskLabels(mode: CropModeRuntime, count = 3) {
  return mode.priorityRisks
    .slice(0, count)
    .map((item) => RISK_LABELS[item])
    .filter(Boolean);
}

function focusLabel(mode: CropModeRuntime) {
  const modules = topModuleLabels(mode, 3);
  const risks = topRiskLabels(mode, 2);
  return uniqueSentences([...modules, ...risks]).slice(0, 4).join(' · ');
}

function modeMeta(mode: CropModeRuntime): CropModePusulaMeta {
  return {
    modeKey: mode.modeKey,
    modeLabel: mode.modeLabel,
    subMode: mode.subMode,
    runtimeTags: [...mode.runtimeTags],
    priorityModules: [...mode.priorityModules],
    priorityRisks: [...mode.priorityRisks],
    focusLabel: focusLabel(mode),
    guardrails: [...mode.guardrails],
  };
}

function cropSpecificAction(mode: CropModeRuntime) {
  if (mode.subMode === 'non_bearing') {
    return 'Kontrolde gelişim evresi, taç/örtü gelişimi, su durumu ve besleme kayıtlarını birlikte değerlendir; hasat veya verim varsayımı yapma.';
  }

  if (mode.subMode === 'dryland') {
    return 'Kontrolde yağış, toprak su tutma durumu, sıcaklık ve gelişim evresini birlikte değerlendir; sulama yapılmış gibi varsayma.';
  }

  switch (mode.modeKey) {
    case 'grape':
      return 'Kontrolde gelişim evresi, yaprak/salkım görünümü ve son yağış-nem koşullarını birlikte değerlendir.';
    case 'almond':
      return 'Kontrolde gelişim/çiçeklenme evresi, düşük sıcaklık koşulları ve su durumunu birlikte değerlendir.';
    case 'hazelnut':
      return 'Kontrolde sürgün-yaprak görünümü, yağış-nem koşulları ve zararlı belirtilerini birlikte değerlendir.';
    case 'maize':
      return 'Kontrolde su durumu, yüksek sıcaklık ve gelişim evresini birlikte değerlendir.';
    case 'wheat':
    case 'barley':
      return 'Kontrolde gelişim evresi, su stresi, yaprak görünümü ve mantari hastalık belirtilerini birlikte değerlendir.';
    case 'sunflower':
      return 'Kontrolde su stresi, sıcaklık, gelişim evresi ve baş gelişimini birlikte değerlendir.';
    case 'cotton':
      return 'Kontrolde su durumu, sıcaklık, bitki gelişimi ve zararlı belirtilerini birlikte değerlendir.';
    case 'olive':
      return 'Kontrolde su stresi, sıcaklık ve yaprak/meyve görünümünü birlikte değerlendir.';
    default:
      return `Kontrolde ${topModuleLabels(mode, 3).join(', ')} başlıklarını birlikte değerlendir.`;
  }
}

function contextSentence(mode: CropModeRuntime) {
  if (mode.fallback) return '';
  const risks = topRiskLabels(mode, 3);
  const modules = topModuleLabels(mode, 3);
  const focus = uniqueSentences([...modules, ...risks]).slice(0, 4);
  if (!focus.length) return '';
  return `${mode.modeLabel} bu değerlendirmede ${focus.join(', ')} başlıklarını öncelikli bağlam olarak kullanıyor.`;
}

function keywordScore(text: string, mode: CropModeRuntime) {
  const haystack = text.toLocaleLowerCase('tr-TR');
  let score = 0;

  const keywordMap: Record<CropModeRisk, string[]> = {
    frost: ['don', 'soğuk', 'düşük sıcaklık'],
    heat: ['ısı', 'sıcaklık', 'yüksek sıcaklık'],
    drought: ['kurak', 'yağış az', 'yağış sınırlı'],
    water_stress: ['su stresi', 'sulama', 'nem', 'su yönetimi', 'drenaj'],
    fungal_disease: ['mantar', 'külleme', 'mildiyö', 'pas', 'hastalık'],
    pest: ['zararlı', 'böcek'],
    weed_pressure: ['yabancı ot'],
    lodging: ['yatma'],
    harvest_weather: ['hasat', 'yağış', 'rüzgâr'],
  };

  mode.priorityRisks.forEach((risk, index) => {
    const rankWeight = Math.max(1, 8 - index);
    if (keywordMap[risk].some((keyword) => haystack.includes(keyword))) {
      score += rankWeight;
    }
  });

  return score;
}

function reorderLikelyCauses(
  causes: Array<Record<string, any>>,
  mode: CropModeRuntime,
) {
  return causes
    .map((item, index) => ({
      item,
      index,
      score: keywordScore(
        `${clean(item?.title)} ${clean(item?.reason)}`,
        mode,
      ),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item);
}

function removeHarvestLanguageWhenNonBearing(value: string) {
  return value
    .replace(/\bhasat(?:\s+ve\s+verim)?\b[^.!?]*[.!?]?/giu, '')
    .replace(/\bverim\b[^.!?]*[.!?]?/giu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function applyCropModeToMapAnalysis<T extends MapAnalysisLike>(
  analysis: T,
  mode: CropModeRuntime | null | undefined,
): T & { cropMode?: CropModePusulaMeta } {
  if (!mode) return analysis as T & { cropMode?: CropModePusulaMeta };

  const attention =
    analysis.status === 'dikkat' ||
    analysis.status === 'kontrol' ||
    Boolean(analysis.importantArea);

  let summary = clean(analysis.summary);
  let action = clean(analysis.action);

  if (attention && !mode.fallback) {
    summary = uniqueSentences([summary, contextSentence(mode)]).join(' ');
  }

  action = uniqueSentences([action, cropSpecificAction(mode)]).join(' ');

  if (mode.subMode === 'non_bearing') {
    summary = removeHarvestLanguageWhenNonBearing(summary);
    action = removeHarvestLanguageWhenNonBearing(action);
  }

  return {
    ...analysis,
    summary,
    action,
    cropMode: modeMeta(mode),
  };
}

export function applyCropModeToFieldSynthesis<T extends SynthesisLike>(
  synthesis: T,
  mode: CropModeRuntime | null | undefined,
): T & { cropMode?: CropModePusulaMeta } {
  if (!mode) return synthesis as T & { cropMode?: CropModePusulaMeta };

  const causes = Array.isArray(synthesis.likelyCauses)
    ? reorderLikelyCauses(synthesis.likelyCauses, mode)
    : synthesis.likelyCauses;

  let summary = clean(synthesis.summary);
  let action = clean(synthesis.action);

  if (!mode.fallback) {
    summary = uniqueSentences([summary, contextSentence(mode)]).join(' ');
  }

  action = uniqueSentences([action, cropSpecificAction(mode)]).join(' ');

  if (mode.subMode === 'non_bearing') {
    summary = removeHarvestLanguageWhenNonBearing(summary);
    action = removeHarvestLanguageWhenNonBearing(action);
  }

  return {
    ...synthesis,
    summary,
    action,
    likelyCauses: causes,
    cropMode: modeMeta(mode),
  };
}
