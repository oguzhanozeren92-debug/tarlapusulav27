import { useCallback, useEffect, useState } from 'react';
import type { Field } from '../../../types';
import {
  loadCropRotationPlan,
  saveCropRotationPreferences,
} from '../services/cropRotation.service';
import type { CropRotationPlan, CropRotationPreferences } from '../types/cropRotation';

export function useCropRotationPlan(field: Field | null | undefined) {
  const fieldId = field && !field.demo ? String(field.id) : '';
  const [plan, setPlan] = useState<CropRotationPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!fieldId) {
      setPlan(null);
      setError('');
      return null;
    }

    setLoading(true);
    setError('');
    try {
      const next = await loadCropRotationPlan(fieldId);
      setPlan(next);
      return next;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Münavebe planı yüklenemedi.';
      setError(message);
      setPlan(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [fieldId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const savePreferences = useCallback(async (preferences: Partial<CropRotationPreferences>) => {
    if (!field || field.demo) return null;
    setSaving(true);
    setError('');
    try {
      await saveCropRotationPreferences(field, preferences);
      return await refresh();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Münavebe ayarları kaydedilemedi.';
      setError(message);
      return null;
    } finally {
      setSaving(false);
    }
  }, [field, refresh]);

  return {
    plan,
    loading,
    saving,
    error,
    refresh,
    savePreferences,
  };
}
