import { useCallback, useEffect, useRef, useState } from 'react';
import type { Field } from '../../../types';
import { loadFieldYieldHarvestQualitySnapshot } from '../services/fieldYieldHarvestQuality.service';
import { persistFieldYieldHarvestEvidence } from '../services/yieldHarvestEvidence.service';
import { mirrorYieldHarvestEvidenceForPdf } from '../../pusula-pdf/services/pusulaPdfYieldHarvestEvidence.service';
import type { FieldYieldHarvestQualityLiveSnapshot } from '../types/fieldYieldHarvestQuality';

type HookState = {
  data: FieldYieldHarvestQualityLiveSnapshot | null;
  loading: boolean;
  error: string | null;
};

const RELEVANT_CHANGED_FIELDS = new Set([
  'yield_context',
  'harvest_history',
  'season',
  'phenology_context',
  'activities',
  'field_operations',
  'field_profile',
]);

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? 'Verim/hasat verisi yüklenemedi.');
}

export function useFieldYieldHarvestQuality(field: Field | null | undefined) {
  const [state, setState] = useState<HookState>({ data: null, loading: false, error: null });
  const requestRef = useRef(0);
  const fieldRef = useRef<Field | null>(field ?? null);
  fieldRef.current = field ?? null;

  const refresh = useCallback(async (options: { forcePhenologyRefresh?: boolean } = {}) => {
    const currentField = fieldRef.current;
    if (!currentField || currentField.demo) {
      setState({ data: null, loading: false, error: null });
      return null;
    }

    const requestId = ++requestRef.current;
    setState((current) => ({ ...current, loading: true, error: null }));

    try {
      const data = await loadFieldYieldHarvestQualitySnapshot(currentField, options);
      if (requestId !== requestRef.current) return data;
      setState({ data, loading: false, error: null });

      void persistFieldYieldHarvestEvidence(data)
        .then((evidence) => mirrorYieldHarvestEvidenceForPdf(evidence))
        .catch((error) => {
          console.warn('[YIELD-HARVEST] ortak kanıt senkronu tamamlanamadı:', error);
        });

      return data;
    } catch (error) {
      if (requestId !== requestRef.current) return null;
      setState((current) => ({ ...current, loading: false, error: errorMessage(error) }));
      return null;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [field?.id, field?.crop, field?.cropCycle, field?.bearing, field?.area, refresh]);

  useEffect(() => {
    if (typeof window === 'undefined' || !field || field.demo) return;

    let timer: number | null = null;
    const fieldId = String(field.id);

    const scheduleRefresh = (forcePhenologyRefresh = false) => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        void refresh({ forcePhenologyRefresh });
      }, 220);
    };

    const onContextUpdated = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail ?? {};
      if (String(detail.fieldId ?? '') !== fieldId) return;

      const changedFields = Array.isArray(detail.changedFields)
        ? detail.changedFields.map((item: unknown) => String(item))
        : [];

      if (!changedFields.length || changedFields.some((item: string) => RELEVANT_CHANGED_FIELDS.has(item))) {
        scheduleRefresh(changedFields.includes('phenology_context'));
      }
    };

    const onOperationChanged = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail ?? {};
      if (String(detail.fieldId ?? '') !== fieldId) return;
      if (String(detail.operationType ?? '').trim().toLocaleLowerCase('tr-TR') === 'hasat') {
        scheduleRefresh(true);
      }
    };

    window.addEventListener('tp:field-context-updated', onContextUpdated as EventListener);
    window.addEventListener('tp:field-operation-changed', onOperationChanged as EventListener);

    return () => {
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener('tp:field-context-updated', onContextUpdated as EventListener);
      window.removeEventListener('tp:field-operation-changed', onOperationChanged as EventListener);
    };
  }, [field?.id, field?.demo, refresh]);

  return {
    snapshot: state.data,
    loading: state.loading,
    error: state.error,
    refresh,
  };
}
