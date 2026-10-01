import { useMemo } from 'react';
import type { Field } from '../../../types';
import { useOrchardTreeContext } from '../../orchard/hooks/useOrchardTreeContext';
import { isOrchardTreePilotCrop } from '../../orchard/services/orchardTree.service';
import { buildFruitLoadRadarSnapshot } from '../services/fruitLoadRadar.service';

export function useFruitLoadRadar(field: Field | null | undefined) {
  const fieldId = String(field?.id ?? '').trim();
  const crop = String(field?.crop ?? '').trim();
  const enabled = Boolean(fieldId && isOrchardTreePilotCrop(crop));
  const orchard = useOrchardTreeContext(fieldId, crop, enabled);

  const snapshot = useMemo(
    () => buildFruitLoadRadarSnapshot(orchard.snapshot),
    [orchard.snapshot],
  );

  return {
    snapshot,
    loading: orchard.loading,
    error: orchard.error,
    refresh: orchard.refresh,
  };
}
