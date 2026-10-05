import { useCallback, useEffect, useMemo, useState } from 'react';
import type { IrrigationDecisionResult } from '../types/irrigationDecision';
import { buildIrrigationWhatIf } from '../services/irrigationWhatIf.service';

type HomeIrrigationDecisionState = {
  fieldKey: string;
  status: 'idle' | 'loading' | 'ready' | 'error';
  data: IrrigationDecisionResult | null;
  error: string | null;
};

const INITIAL_STATE: HomeIrrigationDecisionState = {
  fieldKey: '',
  status: 'idle',
  data: null,
  error: null,
};

/**
 * Ana ekran için hata-izole Irrigation Engine köprüsü.
 *
 * Irrigation service zinciri dinamik import edilir. Böylece kök bölgesi/Kc/
 * fenoloji gibi alt bağımlılıklardan biri yüklenemezse HomeScreen beyaz ekrana
 * düşmez; hook error durumuna geçer ve ortak karar motoru hava-tabanlı güvenli
 * fallback ile çalışmaya devam eder.
 */
export function useHomeIrrigationDecision(field: any | null | undefined) {
  const fieldKey = field?.id != null ? String(field.id) : '';
  const isDemo = Boolean(field?.demo);
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState<HomeIrrigationDecisionState>(INITIAL_STATE);

  useEffect(() => {
    let cancelled = false;

    if (!fieldKey || isDemo) {
      setState(INITIAL_STATE);
      return () => {
        cancelled = true;
      };
    }

    setState({
      fieldKey,
      status: 'loading',
      data: null,
      error: null,
    });

    void (async () => {
      try {
        const irrigationModule = await import(
          '../services/irrigationDecision.service'
        );

        if (typeof irrigationModule.calculateIrrigationDecision !== 'function') {
          throw new Error('Sulama Motoru servisi yüklenemedi.');
        }

        const result = await irrigationModule.calculateIrrigationDecision({
          id: fieldKey,
        });

        if (cancelled) return;

        setState({
          fieldKey,
          status: 'ready',
          data: result,
          error: null,
        });
      } catch (error: unknown) {
        if (cancelled) return;

        const message =
          error instanceof Error
            ? error.message
            : 'Sulama kararı hazırlanamadı.';

        console.warn('[TarlaPusula] Sulama Motoru sonucu alınamadı:', error);
        setState({
          fieldKey,
          status: 'error',
          data: null,
          error: message,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fieldKey, isDemo, refreshKey]);

  useEffect(() => {
    if (!fieldKey || isDemo || typeof window === 'undefined') return;

    const handleFieldContextUpdated = (event: Event) => {
      const detail = (event as CustomEvent)?.detail ?? {};
      const changedFieldId = String(detail?.fieldId ?? '');
      const changedFields = Array.isArray(detail?.changedFields)
        ? detail.changedFields.map((item: unknown) => String(item))
        : [];

      if (changedFieldId !== fieldKey) return;
      if (
        changedFields.length > 0 &&
        !changedFields.some((name) =>
          [
            'irrigation_status',
            'canopy_development_class',
            'canopy_height_class',
            'canopy_cover_percent',
            'canopy_height_m',
            'bearing',
            'crop_cycle',
            'phenology_context',
            'activities',
            'irrigation_history',
          ].includes(name),
        )
      ) {
        return;
      }

      setRefreshKey((value) => value + 1);
    };

    window.addEventListener(
      'tp:field-context-updated',
      handleFieldContextUpdated as EventListener,
    );

    return () => {
      window.removeEventListener(
        'tp:field-context-updated',
        handleFieldContextUpdated as EventListener,
      );
    };
  }, [fieldKey, isDemo]);

  const refresh = useCallback(() => {
    if (!fieldKey || isDemo) return;
    setRefreshKey((value) => value + 1);
  }, [fieldKey, isDemo]);

  const stateBelongsToField = state.fieldKey === fieldKey;
  const result = stateBelongsToField ? state.data : null;
  const whatIf = useMemo(() => (result ? buildIrrigationWhatIf(result) : null), [result]);

  return {
    result,
    decision: result,
    whatIf,
    status: stateBelongsToField ? state.status : fieldKey ? 'loading' : 'idle',
    loading: stateBelongsToField ? state.status === 'loading' : Boolean(fieldKey),
    error: stateBelongsToField ? state.error : null,
    refresh,
  };
}
