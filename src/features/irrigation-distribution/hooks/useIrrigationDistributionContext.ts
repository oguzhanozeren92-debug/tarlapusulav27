import { useEffect, useMemo, useState } from 'react';
import type { FieldOperation } from '../../field-operations/types/fieldOperation';
import { loadIrrigationDistributionSnapshot } from '../services/irrigationDistribution.service';
import type { IrrigationDistributionSnapshot } from '../types/irrigationDistribution';

export function useIrrigationDistributionContext(input: {
  fieldId?: string | number | null;
  operations: FieldOperation[];
  satelliteDate?: string | null;
  homePusulaResult?: any;
  fieldSynthesis?: any;
}) {
  const [snapshot, setSnapshot] = useState<IrrigationDistributionSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldId = String(input.fieldId ?? '').trim();
  const operationKey = useMemo(
    () => input.operations
      .filter((item) => String(item.type).toLocaleLowerCase('tr-TR') === 'sulama')
      .slice(0, 8)
      .map((item) => `${item.id}:${item.date}:${item.quantity ?? ''}`)
      .join('|'),
    [input.operations],
  );
  const spatialKey = useMemo(() => {
    const spatial = input.homePusulaResult?.context?.ndvi?.spatial ?? input.homePusulaResult?.context?.radar?.spatial ?? null;
    try { return JSON.stringify(spatial ?? null).slice(0, 5000); } catch { return ''; }
  }, [input.homePusulaResult]);

  useEffect(() => {
    if (!fieldId) {
      setSnapshot(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void loadIrrigationDistributionSnapshot({
      fieldId,
      operations: input.operations,
      satelliteDate: input.satelliteDate,
      homePusulaResult: input.homePusulaResult,
      fieldSynthesis: input.fieldSynthesis,
    }).then((next) => {
      if (!cancelled) { setSnapshot(next); setError(null); }
    }).catch((reason) => {
      if (!cancelled) {
        setError(reason instanceof Error ? reason.message : 'Sulama dağılımı taranamadı.');
      }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [fieldId, operationKey, input.satelliteDate, spatialKey, input.fieldSynthesis?.importantArea?.area]);

  return { snapshot, loading, error };
}
