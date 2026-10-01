import { contentSourceCatalog } from '../../knowledge/data/sources';

export type SourceRuntimeState = {
  sourceId: string;
  enabled: boolean;
  scanEveryMinutes: number;
  lastScanAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  foundCount: number;
};

const KEY = 'tp_content_source_runtime_v1';
const defaults = () => Object.fromEntries(contentSourceCatalog.map(s => [s.id, { sourceId:s.id, enabled:s.enabled, scanEveryMinutes:s.kind==='news'?60:s.kind==='article'?360:720, lastScanAt:null, lastSuccessAt:null, lastError:null, foundCount:0 } satisfies SourceRuntimeState]));

export function getSourceRuntimeMap(): Record<string, SourceRuntimeState> {
  if (typeof window === 'undefined') return defaults();
  try { return { ...defaults(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return defaults(); }
}
export function getSourceRuntime(sourceId: string) { return getSourceRuntimeMap()[sourceId]; }
export function updateSourceRuntime(sourceId: string, patch: Partial<Omit<SourceRuntimeState,'sourceId'>>) {
  const map = getSourceRuntimeMap();
  map[sourceId] = { ...(map[sourceId] || { sourceId, enabled:true, scanEveryMinutes:360, lastScanAt:null, lastSuccessAt:null, lastError:null, foundCount:0 }), ...patch, sourceId };
  if (typeof window !== 'undefined') { localStorage.setItem(KEY, JSON.stringify(map)); window.dispatchEvent(new CustomEvent('tp:content-source-runtime')); }
  return map[sourceId];
}
export function dueContentSources(at = Date.now()) {
  const map = getSourceRuntimeMap();
  return contentSourceCatalog.filter(s => { const r=map[s.id]; if (!r?.enabled) return false; if (!r.lastScanAt) return true; return at-Date.parse(r.lastScanAt)>=r.scanEveryMinutes*60000; });
}
