import { supabase } from '../../../supabaseClient';
import type {
  ScientificAuthorityRule,
  ScientificEngineDefinition,
} from '../types/scientificEngine';

export type ScientificArchitectureSnapshot = {
  engines: ScientificEngineDefinition[];
  authorities: ScientificAuthorityRule[];
  loadedAt: string;
};

export type ScientificArchitectureAuditIssue = {
  code:
    | 'authority-not-live'
    | 'authority-not-primary'
    | 'authority-flag-missing'
    | 'authority-also-supporting'
    | 'unknown-supporting-engine';
  scope: string;
  engineKey: string;
  detail: string;
};

function mapEngine(row: any): ScientificEngineDefinition {
  return {
    engineKey: String(row.engine_key),
    label: String(row.label ?? row.engine_key),
    family: row.family,
    role: row.role,
    rollout: row.rollout,
    authorityLevel: row.authority_level,
    productionAuthority: Boolean(row.is_production_authority),
    userVisible: Boolean(row.user_visible),
    description: String(row.description ?? ''),
  };
}

function guardrailNames(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>)
    .filter(([, enabled]) => enabled === true)
    .map(([key]) => key);
}

function mapAuthority(row: any): ScientificAuthorityRule {
  return {
    scope: row.scope_key,
    label: String(row.label ?? row.scope_key),
    authorityEngineKey: String(row.authority_engine_key),
    supportingEngineKeys: Array.isArray(row.supporting_engine_keys)
      ? row.supporting_engine_keys.map(String)
      : [],
    guardrails: guardrailNames(row.guardrails),
  };
}

export async function loadScientificArchitecture(): Promise<ScientificArchitectureSnapshot> {
  const [enginesResult, authoritiesResult] = await Promise.all([
    supabase
      .from('scientific_engine_registry')
      .select('engine_key,label,family,role,rollout,authority_level,is_production_authority,user_visible,description')
      .order('family')
      .order('engine_key'),
    supabase
      .from('scientific_engine_authorities')
      .select('scope_key,label,authority_engine_key,supporting_engine_keys,guardrails')
      .order('scope_key'),
  ]);

  if (enginesResult.error) throw enginesResult.error;
  if (authoritiesResult.error) throw authoritiesResult.error;

  return {
    engines: (enginesResult.data ?? []).map(mapEngine),
    authorities: (authoritiesResult.data ?? []).map(mapAuthority),
    loadedAt: new Date().toISOString(),
  };
}

export function auditScientificArchitecture(
  snapshot: ScientificArchitectureSnapshot,
): ScientificArchitectureAuditIssue[] {
  const issues: ScientificArchitectureAuditIssue[] = [];
  const engines = new Map(snapshot.engines.map((engine) => [engine.engineKey, engine]));

  for (const rule of snapshot.authorities) {
    const authority = engines.get(rule.authorityEngineKey);
    if (!authority) continue;

    if (authority.rollout !== 'live') {
      issues.push({ code: 'authority-not-live', scope: rule.scope, engineKey: authority.engineKey, detail: `${authority.label} live değil.` });
    }
    if (authority.authorityLevel !== 'primary') {
      issues.push({ code: 'authority-not-primary', scope: rule.scope, engineKey: authority.engineKey, detail: `${authority.label} primary olarak işaretli değil.` });
    }
    if (!authority.productionAuthority) {
      issues.push({ code: 'authority-flag-missing', scope: rule.scope, engineKey: authority.engineKey, detail: `${authority.label} production authority değil.` });
    }
    if (rule.supportingEngineKeys.includes(rule.authorityEngineKey)) {
      issues.push({ code: 'authority-also-supporting', scope: rule.scope, engineKey: authority.engineKey, detail: 'Aynı motor hem authority hem supporting olamaz.' });
    }
    for (const supportingKey of rule.supportingEngineKeys) {
      if (!engines.has(supportingKey)) {
        issues.push({ code: 'unknown-supporting-engine', scope: rule.scope, engineKey: supportingKey, detail: `${supportingKey} registry içinde bulunamadı.` });
      }
    }
  }

  return issues;
}
