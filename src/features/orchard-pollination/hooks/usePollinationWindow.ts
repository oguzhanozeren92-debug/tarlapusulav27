import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Field } from '../../../types';
import { loadPollinationWindow, resolvePollinationMode } from '../services/pollinationWindow.service';
import type { PollinationWindowSnapshot } from '../types/pollinationWindow';

function finite(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function usePollinationWindow(field: Field | null | undefined, floweringTreeCount = 0) {
  const fieldId = String(field?.id ?? '').trim();
  const crop = String(field?.crop ?? '').trim();
  const latitude = finite(field?.parcelCentroidLat ?? field?.latitude);
  const longitude = finite(field?.parcelCentroidLng ?? field?.longitude);
  const mode = useMemo(() => resolvePollinationMode(crop), [crop]);
  const [snapshot, setSnapshot] = useState<PollinationWindowSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!fieldId || field?.demo || mode === 'unsupported') {
      setSnapshot(null);
      setError('');
      return null;
    }
    if (latitude === null || longitude === null) {
      setSnapshot(null);
      setError('Tarla koordinatı olmadan tozlaşma hava penceresi hesaplanamaz.');
      return null;
    }

    setLoading(true);
    setError('');
    try {
      const next = await loadPollinationWindow({
        fieldId,
        crop,
        latitude,
        longitude,
        floweringTreeCount,
      });
      setSnapshot(next);
      return next;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Tozlaşma penceresi hesaplanamadı.');
      return null;
    } finally {
      setLoading(false);
    }
  }, [fieldId, crop, latitude, longitude, floweringTreeCount, field?.demo, mode]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { snapshot, loading, error, refresh, mode };
}
