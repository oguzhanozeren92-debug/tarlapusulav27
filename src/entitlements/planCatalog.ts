import type { TarlaPusulaPlan } from './useEntitlementStore';

export type PaidPlan = 'premium';

export const PLAN_ORDER: Record<TarlaPusulaPlan, number> = {
  free: 0,
  premium: 1,
};

export const PLAN_LABELS: Record<TarlaPusulaPlan, string> = {
  free: 'Ücretsiz',
  premium: 'Premium',
};

export const PLAN_FIELD_LIMITS: Record<TarlaPusulaPlan, number> = {
  free: 1,
  premium: 999,
};

export type PlanFeatureKey =
  | 'fields'
  | 'satellite'
  | 'pusula'
  | 'dryland'
  | 'irrigation'
  | 'notifications'
  | 'reports'
  | 'widget'
  | 'pusulaPdf'
  | 'orchard'
  | 'bisip'
  | 'storageRisk'
  | 'rotation';

export const PLAN_FEATURE_MATRIX: Array<{
  key: PlanFeatureKey;
  label: string;
  free: string | boolean;
  premium: string | boolean;
}> = [
  { key: 'fields', label: 'Aktif tarla', free: '1', premium: 'Sınırsız' },
  { key: 'satellite', label: 'Uydu ve geçmiş', free: 'Temel', premium: 'Tam kapsam' },
  { key: 'pusula', label: 'Pusula AI', free: 'Temel', premium: 'Tam kapsam' },
  { key: 'dryland', label: 'Kuru Tarım', free: true, premium: true },
  { key: 'irrigation', label: 'Sulama', free: 'Temel', premium: 'Optimizasyon' },
  { key: 'notifications', label: 'Gelişmiş bildirimler', free: false, premium: true },
  { key: 'reports', label: 'Raporlar', free: false, premium: true },
  { key: 'widget', label: 'Gelişmiş widget', free: false, premium: true },
  { key: 'pusulaPdf', label: 'PusulaPDF', free: false, premium: true },
  { key: 'orchard', label: 'Bahçe / ağaç zekâsı', free: false, premium: true },
  { key: 'bisip', label: 'BİSİP / soğuklama', free: false, premium: true },
  { key: 'storageRisk', label: 'Depo / mikotoksin riski', free: false, premium: true },
  { key: 'rotation', label: 'Münavebe / ekim nöbeti', free: false, premium: true },
];

export function planAllows(current: TarlaPusulaPlan, required: PaidPlan) {
  return PLAN_ORDER[current] >= PLAN_ORDER[required];
}

export function planPriceLabel(_plan: PaidPlan, yearly = false) {
  const key = yearly
    ? 'VITE_PREMIUM_YEARLY_PRICE'
    : 'VITE_PREMIUM_MONTHLY_PRICE';

  const value = String((import.meta as any)?.env?.[key] ?? '').trim();
  return value || 'Mağazada';
}
