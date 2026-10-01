import { supabase } from '../../../supabaseClient';
import type { ScientificEvidenceRecord, ScientificEvidenceSnapshot } from '../types/scientificEngine';

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function mapRow(row: any): ScientificEvidenceRecord {
  return {
    id: String(row.id),
    fieldId: String(row.field_id),
    engineKey: String(row.engine_key),
    authorityScope: row.authority_scope ? String(row.authority_scope) : null,
    evidenceKind: String(row.evidence_kind ?? ''),
    status: row.status,
    productionAuthority: Boolean(row.production_authority),
    confidence: row.confidence ?? 'unknown',
    observedAt: row.observed_at ? String(row.observed_at) : null,
    generatedAt: String(row.generated_at ?? row.created_at ?? ''),
    engineVersion: row.engine_version ? String(row.engine_version) : null,
    adapterVersion: row.adapter_version ? String(row.adapter_version) : null,
    evidence: object(row.evidence),
    output: object(row.output),
  };
}

export async function getScientificEvidenceSnapshot(
  fieldIdValue: string | number | null | undefined,
  limit = 120,
): Promise<ScientificEvidenceSnapshot | null> {
  const fieldId = String(fieldIdValue ?? '').trim();
  if (!fieldId) return null;

  const { data, error } = await supabase
    .from('scientific_engine_evidence')
    .select('id,field_id,engine_key,authority_scope,evidence_kind,status,production_authority,confidence,observed_at,generated_at,engine_version,adapter_version,evidence,output,created_at')
    .eq('field_id', fieldId)
    .order('generated_at', { ascending: false })
    .limit(Math.max(10, Math.min(250, limit)));

  if (error) throw error;

  const rows = (data ?? []).map(mapRow);
  const latestByEngineScope = new Map<string, ScientificEvidenceRecord>();
  for (const row of rows) {
    const key = `${row.authorityScope ?? 'none'}:${row.engineKey}`;
    if (!latestByEngineScope.has(key)) latestByEngineScope.set(key, row);
  }

  const latest = [...latestByEngineScope.values()];
  const authoritative = latest.filter((row) => row.productionAuthority);
  const supporting = latest.filter((row) => !row.productionAuthority);
  const byScope: ScientificEvidenceSnapshot['byScope'] = {};

  for (const row of latest) {
    if (!row.authorityScope) continue;
    const slot = byScope[row.authorityScope] ?? { authority: null, supporting: [] };
    if (row.productionAuthority) {
      if (!slot.authority) slot.authority = row;
    } else {
      slot.supporting.push(row);
    }
    byScope[row.authorityScope] = slot;
  }

  return {
    fieldId,
    generatedAt: new Date().toISOString(),
    authoritative,
    supporting,
    byScope,
  };
}
