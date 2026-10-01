import { useEffect, useMemo, useState } from 'react';
import { fetchFieldSatelliteFusion } from '../services/satelliteFusion.service';
import type { ActiveProductionValidation } from '../types/satelliteFusion';

export type { ActiveProductionValidation } from '../types/satelliteFusion';

export function useActiveProductionValidation(
  fieldId: string | number | null | undefined,
) {
  const key = String(fieldId ?? '').trim();
  const [state, setState] = useState<{
    key: string;
    status: 'idle' | 'loading' | 'ready' | 'error';
    data: ActiveProductionValidation | null;
    generatedAt: string | null;
    error: string | null;
  }>({
    key: '',
    status: 'idle',
    data: null,
    generatedAt: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    if (!key) {
      setState({
        key: '',
        status: 'idle',
        data: null,
        generatedAt: null,
        error: null,
      });
      return () => {
        cancelled = true;
      };
    }

    setState((current) => ({
      key,
      status: 'loading',
      data: current.key === key ? current.data : null,
      generatedAt: current.key === key ? current.generatedAt : null,
      error: null,
    }));

    void fetchFieldSatelliteFusion(key)
      .then((result) => {
        if (cancelled) return;
        setState({
          key,
          status: 'ready',
          data: result.activeProduction,
          generatedAt: result.generatedAt ?? null,
          error: null,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setState((current) => ({
          key,
          status: 'error',
          data: current.key === key ? current.data : null,
          generatedAt: current.key === key ? current.generatedAt : null,
          error:
            error instanceof Error
              ? error.message
              : 'Aktif üretim doğrulaması başarısız.',
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [key]);

  const signature = useMemo(
    () =>
      [
        key,
        state.status,
        state.generatedAt ?? '',
        state.data?.status ?? '',
        state.data?.confidence ?? '',
        state.data?.metrics?.latest_ndvi ?? '',
        state.data?.metrics?.optical_sample_count ?? '',
        state.data?.metrics?.radar_sample_count ?? '',
      ].join('|'),
    [key, state],
  );

  return {
    status: state.status,
    data: state.data,
    generatedAt: state.generatedAt,
    error: state.error,
    signature,
  };
}
