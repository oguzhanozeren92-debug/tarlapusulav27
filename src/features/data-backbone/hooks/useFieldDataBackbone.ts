import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildFieldDataBackboneSnapshot } from '../services/fieldDataBackbone.service';
import type { FieldDataBackboneSnapshot } from '../types/fieldDataBackbone';

type FieldDataBackboneState = {
  snapshot: FieldDataBackboneSnapshot | null;
  loading: boolean;
  error: string | null;
};

function fieldIdText(value: string | number | null | undefined) {
  return String(value ?? '').trim();
}

export function useFieldDataBackbone(
  fieldIdInput: string | number | null | undefined,
  limit = 120,
) {
  const fieldId = useMemo(() => fieldIdText(fieldIdInput), [fieldIdInput]);
  const requestIdRef = useRef(0);
  const [state, setState] = useState<FieldDataBackboneState>({
    snapshot: null,
    loading: Boolean(fieldId),
    error: null,
  });

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;

    if (!fieldId) {
      setState({ snapshot: null, loading: false, error: null });
      return null;
    }

    setState((previous) => ({ ...previous, loading: true, error: null }));

    try {
      const snapshot = await buildFieldDataBackboneSnapshot(fieldId, limit);
      if (requestId !== requestIdRef.current) return snapshot;
      setState({ snapshot, loading: false, error: null });
      return snapshot;
    } catch (error) {
      if (requestId !== requestIdRef.current) return null;
      const message =
        error instanceof Error ? error.message : 'Tarla veri omurgası okunamadı.';
      setState((previous) => ({ ...previous, loading: false, error: message }));
      return null;
    }
  }, [fieldId, limit]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!fieldId || typeof window === 'undefined') return undefined;

    const shouldRefresh = (event: Event) => {
      const custom = event as CustomEvent<any>;
      const eventFieldId = fieldIdText(
        custom.detail?.fieldId ?? custom.detail?.field_id ?? custom.detail?.field?.id,
      );
      if (eventFieldId && eventFieldId !== fieldId) return;
      void refresh();
    };

    const events = [
      'tp:field-context-updated',
      'tp:field-operation-saved',
      'tp:field-operation-changed',
      'tp:soil-analysis-updated',
      'tp:field-water-measurement-updated',
      'tp:phenology-observation-updated',
    ];

    events.forEach((name) => window.addEventListener(name, shouldRefresh));
    return () => {
      events.forEach((name) => window.removeEventListener(name, shouldRefresh));
    };
  }, [fieldId, refresh]);

  const signature = useMemo(() => {
    if (!state.snapshot) return 'empty';
    const latestCreatedAt = state.snapshot.events[0]?.createdAt ?? '';
    return `${state.snapshot.eventCount}:${latestCreatedAt}:${state.snapshot.changedFields.join('|')}`;
  }, [state.snapshot]);

  return {
    ...state,
    refresh,
    signature,
    ready: Boolean(state.snapshot) && !state.loading && !state.error,
  };
}
