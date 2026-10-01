import { useCallback, useEffect, useRef, useState } from 'react';
import type { Field } from '../../../types';
import { useFieldYieldHarvestQuality } from '../../yield-quality/hooks/useFieldYieldHarvestQuality';
import { listOrchardTreeObservations } from '../../orchard/services/orchardTree.service';
import { buildHarvestReadiness } from '../services/harvestReadiness.service';
import { fetchHarvestWorkForecast } from '../services/harvestWeather.service';
import type { HarvestReadinessSnapshot } from '../types/harvestReadiness';

export function useHarvestReadiness(field: Field | null | undefined) {
  const yieldState = useFieldYieldHarvestQuality(field);
  const [snapshot, setSnapshot] = useState<HarvestReadinessSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!field || field.demo || (field.cropCycle ?? 'annual') !== 'perennial') {
      setSnapshot(null);
      setLoading(false);
      setError(null);
      return null;
    }

    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);

    try {
      const yieldLive = yieldState.snapshot ?? await yieldState.refresh();
      const [observations, forecast] = await Promise.all([
        listOrchardTreeObservations(field.id, 200).catch(() => []),
        fetchHarvestWorkForecast(field),
      ]);
      if (!yieldLive) throw new Error('Hasat zamanı için verim/fenoloji bağlamı alınamadı.');

      const latest = observations[0] ?? null;
      const harvestTiming = yieldLive.snapshot.ensemble?.harvestTiming;
      const expectedDate = harvestTiming?.date ?? yieldLive.snapshot.harvest.expectedDate;
      const daysToExpected = yieldLive.snapshot.harvest.daysToExpectedHarvest;

      const next = buildHarvestReadiness({
        fieldId: String(field.id),
        crop: field.crop,
        actualHarvestDate: yieldLive.snapshot.harvest.actualDate,
        expectedHarvestDate: expectedDate,
        daysToExpectedHarvest: daysToExpected,
        phenologyStage: yieldLive.snapshot.harvest.stage,
        orchardStage: latest?.stage ?? null,
        fruitLoad: latest?.fruitLoad ?? null,
        yieldDataQuality: yieldLive.snapshot.dataQuality,
        forecast,
      });

      if (requestId === requestRef.current) setSnapshot(next);
      return next;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Hasat penceresi hazırlanamadı.';
      if (requestId === requestRef.current) setError(message);
      return null;
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [field?.id, field?.crop, field?.cropCycle, field?.demo, yieldState.snapshot, yieldState.refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { snapshot, loading: loading || yieldState.loading, error: error || yieldState.error, refresh };
}
