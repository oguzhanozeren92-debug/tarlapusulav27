import { useEffect, useState } from 'react';
import { loadStorageRiskSnapshot } from '../services/storageRisk.service';
import type { StorageRiskSnapshot } from '../types/storageRisk';

export function useStorageRiskContext(fieldId: string | number | null | undefined) {
  const key = fieldId == null ? '' : String(fieldId);
  const [snapshot, setSnapshot] = useState<StorageRiskSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!key) { setSnapshot(null); setLoading(false); setError(null); return; }
    setLoading(true); setError(null);
    void loadStorageRiskSnapshot(key).then((value) => {
      if (!cancelled) setSnapshot(value);
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : 'Depo riski alınamadı.');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [key, nonce]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => setNonce((value) => value + 1);
    window.addEventListener('tp:storage-risk-updated', handler);
    return () => window.removeEventListener('tp:storage-risk-updated', handler);
  }, []);

  return { snapshot, loading, error, refresh: () => setNonce((value) => value + 1) };
}
