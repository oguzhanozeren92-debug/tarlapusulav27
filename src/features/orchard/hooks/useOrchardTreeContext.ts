import { useCallback, useEffect, useState } from 'react';
import { buildOrchardIntelligenceSnapshot, loadOrchardIntelligenceSnapshot } from '../services/orchardIntelligence.service';
import type { OrchardIntelligenceSnapshot } from '../types/orchardTree';

export function useOrchardTreeContext(fieldIdInput: unknown, cropInput: unknown, enabled = true) {
  const fieldId = String(fieldIdInput ?? '').trim();
  const crop = String(cropInput ?? '').trim();
  const [snapshot, setSnapshot] = useState<OrchardIntelligenceSnapshot>(() =>
    buildOrchardIntelligenceSnapshot({ fieldId, crop, trees: [], observations: [] }),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!enabled || !fieldId) {
      const empty = buildOrchardIntelligenceSnapshot({ fieldId, crop, trees: [], observations: [] });
      setSnapshot(empty);
      return empty;
    }
    setLoading(true);
    setError('');
    try {
      const next = await loadOrchardIntelligenceSnapshot(fieldId, crop);
      setSnapshot(next);
      return next;
    } catch (value) {
      const message = value instanceof Error ? value.message : 'Bahçe ağaç verisi alınamadı.';
      setError(message);
      throw value;
    } finally {
      setLoading(false);
    }
  }, [enabled, fieldId, crop]);

  useEffect(() => {
    void refresh().catch(() => undefined);
  }, [refresh]);

  return { snapshot, loading, error, refresh };
}
