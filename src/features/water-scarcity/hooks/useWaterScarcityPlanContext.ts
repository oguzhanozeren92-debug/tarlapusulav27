import { useEffect, useMemo, useState } from 'react';
import type { IrrigationDecisionResult } from '../../irrigation/types/irrigationDecision';
import type { PhenologyResult } from '../../phenology/types/phenology';
import { loadWaterScarcityPlanSnapshot } from '../services/waterScarcityPlan.service';
import type { WaterScarcityPlanSnapshot } from '../types/waterScarcity';

export function useWaterScarcityPlanContext(input: {
  fieldId?: string | number | null;
  irrigationDecision?: IrrigationDecisionResult | null;
  phenology?: Pick<PhenologyResult, 'stage' | 'stageLabel' | 'confidence' | 'dataStatus'> | null;
}) {
  const fieldId = String(input.fieldId ?? '').trim();
  const [snapshot, setSnapshot] = useState<WaterScarcityPlanSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  const decisionKey = useMemo(() => {
    const d = input.irrigationDecision;
    return [
      d?.decision ?? '',
      d?.irrigationStatus ?? '',
      d?.recommendation?.totalNetWaterM3 ?? '',
      d?.waterBalance?.projected5DayDeficitMm ?? '',
      d?.generatedAt ?? '',
      input.phenology?.stage ?? '',
      input.phenology?.confidence ?? '',
    ].join('|');
  }, [input.irrigationDecision, input.phenology]);

  useEffect(() => {
    if (typeof window === 'undefined' || !fieldId) return;

    const onRefresh = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail ?? {};
      if (!detail.fieldId || String(detail.fieldId) === fieldId) {
        setRevision((value) => value + 1);
      }
    };

    window.addEventListener('tp:water-scarcity-budget-updated', onRefresh);
    window.addEventListener('tp:irrigation-economics-updated', onRefresh);
    window.addEventListener('tp:field-operation-changed', onRefresh);
    window.addEventListener('tp:field-context-updated', onRefresh);

    return () => {
      window.removeEventListener('tp:water-scarcity-budget-updated', onRefresh);
      window.removeEventListener('tp:irrigation-economics-updated', onRefresh);
      window.removeEventListener('tp:field-operation-changed', onRefresh);
      window.removeEventListener('tp:field-context-updated', onRefresh);
    };
  }, [fieldId]);

  useEffect(() => {
    if (!fieldId) {
      setSnapshot(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void loadWaterScarcityPlanSnapshot({
      fieldId,
      irrigationDecision: input.irrigationDecision ?? null,
      phenology: input.phenology ?? null,
    })
      .then((next) => {
        if (!cancelled) {
          setSnapshot(next);
          setError(null);
        }
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : 'Su Kıtlığı Planı hazırlanamadı.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fieldId, decisionKey, revision]);

  return { snapshot, loading, error, refresh: () => setRevision((value) => value + 1) };
}
