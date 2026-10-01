import { useCallback, useEffect, useRef, useState } from 'react';
import {
  loadIrrigationSatelliteValidation,
  type IrrigationSatelliteValidation,
} from '../services/irrigationSatelliteValidation.service';

export function useIrrigationSatelliteValidation(
  fieldIdInput: string | null | undefined,
  refreshNonce = 0,
) {
  const fieldId = String(fieldIdInput ?? '').trim();
  const requestRef = useRef(0);
  const [data, setData] =
    useState<IrrigationSatelliteValidation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(
    async (force = true) => {
      if (!fieldId) {
        setData(null);
        setError('');
        setLoading(false);
        return null;
      }

      const requestId = requestRef.current + 1;
      requestRef.current = requestId;
      setLoading(true);
      setError('');

      try {
        const next = await loadIrrigationSatelliteValidation(
          fieldId,
          force,
        );
        if (requestRef.current === requestId) setData(next);
        return next;
      } catch (reason) {
        const message =
          reason instanceof Error
            ? reason.message
            : 'Sulama uydu doğrulaması hazırlanamadı.';
        if (requestRef.current === requestId) {
          setError(message);
          setData(null);
        }
        return null;
      } finally {
        if (requestRef.current === requestId) setLoading(false);
      }
    },
    [fieldId],
  );

  useEffect(() => {
    void refresh(false);
  }, [fieldId, refreshNonce, refresh]);

  return {
    data,
    loading,
    error,
    refresh,
  };
}
