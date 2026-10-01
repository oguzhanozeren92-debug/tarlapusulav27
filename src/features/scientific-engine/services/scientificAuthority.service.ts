import type { HomeDecisionSource } from '../../decision/types/homeDecision';
import { SCIENTIFIC_AUTHORITY_RULES, SCIENTIFIC_ENGINES } from '../data/scientificEngineRegistry';
import type { ScientificAuthorityResolution, ScientificAuthorityScope } from '../types/scientificEngine';

const SOURCE_SCOPE: Partial<Record<HomeDecisionSource, ScientificAuthorityScope>> = {
  irrigation: 'irrigation.daily_decision',
  phenology: 'phenology.current_stage',
  satellite: 'satellite.vegetation_interpretation',
  nutrition: 'nutrition.field_decision',
  'risk-radar': 'risk.disease_pest',
  'weed-intelligence': 'weed.field_observation',
  'yield-harvest': 'yield.harvest_quality',
  'orchard-tree': 'orchard.tree_observation',
  'field-workability': 'field.workability',
  'irrigation-distribution': 'irrigation.distribution_screening',
  'water-scarcity': 'irrigation.water_scarcity_plan',
  'multi-stress': 'field.multi_stress_synthesis',
  pusula: 'field.overall_synthesis',
};

const ALIASES: Array<[RegExp, string]> = [
  [/irrigation-engine|irrigation-decision/i, 'irrigation-engine'],
  [/pyfao56/i, 'pyfao56'],
  [/aquacrop/i, 'aquacrop'],
  [/pcse|wofost/i, 'pcse-wofost'],
  [/pystics/i, 'pystics-wheat-runtime'],
  [/dssat/i, 'dssat-shadow'],
  [/yield-harvest|yield-ensemble/i, 'yield-harvest-engine'],
  [/orchard-tree|tree-engine|bahce-tree/i, 'orchard-tree-engine'],
  [/orchard-chill|chill-accumulation|bisip/i, 'orchard-chill-engine'],
  [/field-workability|workability|trafficability/i, 'field-workability-engine'],
  [/irrigation-distribution|distribution-screening|sulama-dağılım/i, 'irrigation-distribution-engine'],
  [/water-scarcity|su-kıtlığı|scarcity-plan/i, 'water-scarcity-plan-engine'],
  [/multi-stress|coklu-stres|birlesik-stres/i, 'multi-stress-synthesis'],
  [/asymetree/i, 'asymetree-reference'],
  [/samson/i, 'samson-reference'],
  [/fruitmeasure/i, 'fruitmeasure-reference'],
  [/mangosense/i, 'mangosense-reference'],
  [/cropforge/i, 'cropforge'],
  [/phenology-fusion|phenology-engine|\bphenology\b/i, 'phenology-engine'],
  [/nasa-harvest/i, 'nasa-harvest-crop-stage'],
  [/satellite-fusion|satellite-decision/i, 'satellite-fusion'],
  [/sl2p/i, 'sl2p-biophysics'],
  [/rscm/i, 'rscm-assimilation'],
  [/soil-nutrition/i, 'soil-nutrition-engine'],
  [/ndvi-differential|nutrition-differential/i, 'nutrition-differential-filter'],
  [/soilgrids/i, 'soilgrids'],
  [/regional-observation|regional-risk/i, 'regional-risk-observation'],
  [/risk-radar/i, 'risk-radar'],
  [/field-synthesis|pusula-field-synthesis/i, 'pusula-field-synthesis'],
];

function sourceEngines(sourceModel: string) {
  const result = new Set<string>();
  for (const [pattern, key] of ALIASES) {
    if (pattern.test(sourceModel)) result.add(key);
  }
  return [...result];
}

export function resolveScientificAuthority(
  source: HomeDecisionSource,
  sourceModelValue?: string | null,
): ScientificAuthorityResolution {
  const sourceModel = String(sourceModelValue ?? '').trim();
  const scope = SOURCE_SCOPE[source] ?? null;
  const rule = scope ? SCIENTIFIC_AUTHORITY_RULES[scope] : null;
  const detected = sourceEngines(sourceModel);

  if (!rule) {
    return {
      scope: null,
      authorityEngineKey: null,
      authorityLabel: null,
      sourceEngineKeys: detected,
      supportingEngineKeys: detected,
      productionAuthority: false,
      rollout: null,
      guardrails: [],
    };
  }

  const authority = SCIENTIFIC_ENGINES[rule.authorityEngineKey] ?? null;
  const supporting = detected.filter((key) => key !== rule.authorityEngineKey);

  return {
    scope,
    authorityEngineKey: rule.authorityEngineKey,
    authorityLabel: authority?.label ?? rule.authorityEngineKey,
    sourceEngineKeys: detected.length ? detected : [rule.authorityEngineKey],
    supportingEngineKeys: supporting,
    productionAuthority: Boolean(authority?.productionAuthority),
    rollout: authority?.rollout ?? null,
    guardrails: [...rule.guardrails],
  };
}

export function canScientificEngineOverride(
  scope: ScientificAuthorityScope,
  engineKey: string,
) {
  return SCIENTIFIC_AUTHORITY_RULES[scope].authorityEngineKey === engineKey;
}
