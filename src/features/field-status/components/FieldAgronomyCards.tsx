import { useEffect, useState } from 'react';
import type { Field } from '../../../types';
import { supabase } from '../../../supabaseClient';
import FieldWaterNeedCard from '../../water-need/components/FieldWaterNeedCard';
import FieldHarvestSafetyCard from '../../harvest-safety/components/FieldHarvestSafetyCard';
import FieldPestCalendarCard from '../../pest-calendar/components/FieldPestCalendarCard';

export type AgronomyActivity = {
  type: string; activityDate: string; productName: string | null;
  quantity: number | null; unit: string | null; notes: string | null;
};

/** Tarla Durumu kartları için tarla işlemleri (sulama m³, ilaçlama bekleme süresi). */
export function useAgronomyActivities(field: Field | null, refreshKey?: number) {
  const [activities, setActivities] = useState<AgronomyActivity[]>([]);
  const id = field && !field.demo ? String(field.id) : null;
  useEffect(() => {
    if (!id) { setActivities([]); return; }
    let cancelled = false;
    supabase.from('activities')
      .select('activity_type, activity_date, product_name, quantity, unit, notes')
      .eq('field_id', id)
      .order('activity_date', { ascending: false })
      .limit(500)
      .then(({ data, error }) => {
        if (cancelled || error) return;
        setActivities((data ?? []).map((item: any) => ({
          type: String(item.activity_type ?? 'Diğer'),
          activityDate: String(item.activity_date ?? ''),
          productName: item.product_name ?? null,
          quantity: item.quantity == null ? null : Number(item.quantity),
          unit: item.unit ?? null,
          notes: item.notes ?? null,
        })).filter((a: AgronomyActivity) => a.activityDate));
      });
    return () => { cancelled = true; };
  }, [id, refreshKey]);
  return activities;
}

const asField = (field: any): Field | null => (field && !field.demo && field.id != null && field.crop ? field as Field : null);

export function SummaryAgronomyCards({ field, activities }: { field: any; activities: AgronomyActivity[] }) {
  if (!asField(field)) return null;
  return <FieldHarvestSafetyCard activities={activities} />;
}

export function RiskAgronomyCards({ field }: { field: any }) {
  const f = asField(field);
  return f ? <FieldPestCalendarCard field={f} /> : null;
}

export function IrrigationAgronomyCards({ field, activities }: { field: any; activities: AgronomyActivity[] }) {
  const f = asField(field);
  return f ? <FieldWaterNeedCard field={f} activities={activities} plantingDate={null} /> : null;
}
