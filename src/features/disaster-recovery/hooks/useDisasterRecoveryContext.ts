import { useEffect, useMemo, useState } from 'react';
import {
  fetchDisasterRecovery,
  type DisasterRecoveryResult,
} from '../services/disasterRecovery.service';

type State = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  data: DisasterRecoveryResult | null;
  error: string | null;
  generatedAt: string | null;
};

const EMPTY: State = {
  status: 'idle',
  data: null,
  error: null,
  generatedAt: null,
};

export function useDisasterRecoveryContext(
  fieldId: string | number | null | undefined,
) {
  const key = String(fieldId ?? '').trim();
  const [state, setState] = useState<State>(EMPTY);

  useEffect(() => {
    if (!key) {
      setState(EMPTY);
      return;
    }

    let active = true;
    setState((current) => ({
      ...current,
      status: 'loading',
      error: null,
    }));

    void fetchDisasterRecovery(key)
      .then((data) => {
        if (!active) return;
        setState({
          status: 'ready',
          data,
          error: null,
          generatedAt: data.generatedAt,
        });
      })
      .catch((error) => {
        if (!active) return;
        setState({
          status: 'error',
          data: null,
          error:
            error instanceof Error
              ? error.message
              : 'Afet/iyileşme takibi hazırlanamadı.',
          generatedAt: null,
        });
      });

    return () => {
      active = false;
    };
  }, [key]);

  const signature = useMemo(
    () =>
      [
        key,
        state.status,
        state.data?.status ?? '',
        state.data?.event?.date ?? '',
        state.data?.damage.ndviDropPercent ?? '',
        state.data?.recovery.percentOfPreEvent ?? '',
        state.generatedAt ?? '',
      ].join('|'),
    [
      key,
      state.status,
      state.data,
      state.generatedAt,
    ],
  );

  return {
    ...state,
    signature,
  };
}
