import { useCallback, useEffect, useState } from 'react';
import type { Field } from '../../../types';
import {
  clearOrchardChillCache,
  loadOrchardChillSnapshot,
} from '../services/orchardChill.service';
import type { OrchardChillSnapshot } from '../types/orchardChill';

export function useOrchardChill(field: Field | null | undefined) {
  const [snapshot, setSnapshot] = useState<OrchardChillSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(
    async (force = false) => {
      if (!field?.id || field.demo) {
        setSnapshot(null);
        setError('');
        return null;
      }

      setLoading(true);
      setError('');

      try {
        if (force) {
          clearOrchardChillCache(field.id);
        }

        const next = await loadOrchardChillSnapshot(field.id);
        setSnapshot(next);
        return next;
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : 'Soğuklama bilgisi alınamadı.',
        );
        return null;
      } finally {
        setLoading(false);
      }
    },
    [field?.id, field?.demo],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  return {
    snapshot,
    loading,
    error,
    refresh: () => load(true),
  };
}