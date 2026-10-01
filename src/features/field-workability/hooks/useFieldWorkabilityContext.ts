import { useEffect, useMemo, useState } from 'react';
import type { FrostPocketSnapshot } from '../../frost-pocket/types/frostPocket';
import { loadFieldWorkabilitySnapshot } from '../services/fieldWorkability.service';
import type { FieldWorkabilitySnapshot } from '../types/fieldWorkability';

type Input = {
  fieldId?: string | number | null;
  rainMm?: number | null;
  rainChance?: number | null;
  terrain?: FrostPocketSnapshot['terrain'] | null;
};

export function useFieldWorkabilityContext(input: Input) {
  const fieldId = String(input.fieldId ?? '').trim();
  const [snapshot, setSnapshot] = useState<FieldWorkabilitySnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const refresh = (event: Event) => {
      const detailFieldId = String((event as CustomEvent)?.detail?.fieldId ?? '').trim();
      if (!detailFieldId || detailFieldId === fieldId) setNonce((value) => value + 1);
    };
    window.addEventListener('tp:soil-water-updated', refresh as EventListener);
    window.addEventListener('tp:field-operation-changed', refresh as EventListener);
    return () => {
      window.removeEventListener('tp:soil-water-updated', refresh as EventListener);
      window.removeEventListener('tp:field-operation-changed', refresh as EventListener);
    };
  }, [fieldId]);

  const terrainSignature = useMemo(() => {
    const terrain = input.terrain;
    if (!terrain) return 'none';
    return [terrain.reliefM ?? '', terrain.highPocketCount, terrain.mediumPocketCount, terrain.cells.length]
      .join('|');
  }, [input.terrain]);

  useEffect(() => {
    if (!fieldId) {
      setSnapshot(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void loadFieldWorkabilitySnapshot(fieldId, {
      rainMm: input.rainMm ?? null,
      rainChance: input.rainChance ?? null,
      terrain: input.terrain ?? null,
    })
      .then((next) => {
        if (!cancelled) setSnapshot(next);
      })
      .catch((reason) => {
        if (!cancelled) {
          setSnapshot(null);
          setError(reason instanceof Error ? reason.message : 'Tarlaya giriş değerlendirmesi hazırlanamadı.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [fieldId, input.rainMm, input.rainChance, terrainSignature, nonce]);

  return { snapshot, loading, error };
}
