import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../supabaseClient';
import { loadMicroclimateSensorSnapshot } from '../services/microclimateSensor.service';
import type { MicroclimateSensorSnapshot } from '../types/microclimateSensor';

export function useMicroclimateSensorContext(fieldIdInput: string | number | null | undefined) {
  const fieldId = String(fieldIdInput ?? '').trim();
  const [snapshot, setSnapshot] = useState<MicroclimateSensorSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!fieldId) {
      setSnapshot(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    try {
      const next = await loadMicroclimateSensorSnapshot(fieldId);
      setSnapshot(next);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Mikroiklim sensörleri okunamadı.');
    } finally {
      setLoading(false);
    }
  }, [fieldId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!fieldId) return;
    const channel = supabase
      .channel(`tp-sensor-field-${fieldId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'field_sensor_devices', filter: `field_id=eq.${fieldId}`,
      }, () => void refresh())
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'field_sensor_observations', filter: `field_id=eq.${fieldId}`,
      }, () => void refresh())
      .subscribe();

    const onLocal = (event: Event) => {
      const detail = (event as CustomEvent)?.detail;
      if (!detail?.fieldId || String(detail.fieldId) === fieldId) void refresh();
    };
    window.addEventListener('tp:sensor-config-updated', onLocal as EventListener);
    window.addEventListener('tp:sensor-observation', onLocal as EventListener);
    return () => {
      window.removeEventListener('tp:sensor-config-updated', onLocal as EventListener);
      window.removeEventListener('tp:sensor-observation', onLocal as EventListener);
      void supabase.removeChannel(channel);
    };
  }, [fieldId, refresh]);

  const signature = useMemo(
    () => [fieldId, snapshot?.latestObservedAt ?? '', snapshot?.status ?? '', snapshot?.rangeAlerts.length ?? 0].join('|'),
    [fieldId, snapshot?.latestObservedAt, snapshot?.status, snapshot?.rangeAlerts.length],
  );

  return { snapshot, loading, error, refresh, signature };
}
