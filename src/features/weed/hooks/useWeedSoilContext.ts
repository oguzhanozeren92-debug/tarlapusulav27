import { useEffect, useState } from 'react';
import {
  fetchLatestWeedSoilContext,
  type WeedSoilContext,
} from '../services/weedSoilClue.service';

type WeedSoilContextState = {
  data: WeedSoilContext | null;
  loading: boolean;
  error: string | null;
  generatedAt: string | null;
};

const EMPTY_STATE: WeedSoilContextState = {
  data: null,
  loading: false,
  error: null,
  generatedAt: null,
};

export function useWeedSoilContext(fieldId: string | number | null | undefined) {
  const key = String(fieldId ?? '').trim();
  const [state, setState] = useState<WeedSoilContextState>(EMPTY_STATE);

  useEffect(() => {
    if (!key) {
      setState(EMPTY_STATE);
      return;
    }

    let cancelled = false;
    setState((current) => ({ ...current, loading: true, error: null }));

    void fetchLatestWeedSoilContext(key)
      .then((data) => {
        if (cancelled) return;
        setState({
          data,
          loading: false,
          error: null,
          generatedAt: data.generatedAt,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({
          data: null,
          loading: false,
          error: error instanceof Error ? error.message : 'Toprak bağlamı okunamadı.',
          generatedAt: null,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [key]);

  return state;
}
