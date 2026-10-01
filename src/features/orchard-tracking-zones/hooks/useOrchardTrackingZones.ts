import { useCallback, useEffect, useState } from 'react';
import {
  listOrchardTrackingZones,
  ORCHARD_TRACKING_ZONES_CHANGED_EVENT,
} from '../services/orchardTrackingZone.service';
import type { OrchardTrackingZoneRecord } from '../types/orchardTrackingZone';

export function useOrchardTrackingZones(
  fieldIdInput: unknown,
  enabled = true,
) {
  const fieldId = String(fieldIdInput ?? '').trim();
  const [zones, setZones] = useState<OrchardTrackingZoneRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled || !fieldId) {
      setZones([]);
      setLoading(false);
      setError(null);
      return [] as OrchardTrackingZoneRecord[];
    }

    setLoading(true);
    setError(null);
    try {
      const next = await listOrchardTrackingZones(fieldId);
      setZones(next);
      return next;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Takip bölgeleri alınamadı.',
      );
      return [] as OrchardTrackingZoneRecord[];
    } finally {
      setLoading(false);
    }
  }, [enabled, fieldId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled || !fieldId) return;
    const onChanged = (event: Event) => {
      const detail = (event as CustomEvent)?.detail ?? {};
      const changedFieldId = String(detail.fieldId ?? '').trim();
      if (!changedFieldId || changedFieldId === fieldId) void refresh();
    };
    window.addEventListener(
      ORCHARD_TRACKING_ZONES_CHANGED_EVENT,
      onChanged as EventListener,
    );
    return () => {
      window.removeEventListener(
        ORCHARD_TRACKING_ZONES_CHANGED_EVENT,
        onChanged as EventListener,
      );
    };
  }, [enabled, fieldId, refresh]);

  return { zones, loading, error, refresh };
}
