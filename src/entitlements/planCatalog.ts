import type { TarlaPusulaPlan } from './useEntitlementStore';

export type PaidPlan = 'plus' | 'premium';

export const PLAN_ORDER: Record<TarlaPusulaPlan, number> = {
  free: 0,
  plus: 1,
  premium: 2,
};

export const PLAN_LABELS: Record<TarlaPusulaPlan, string> = {
  free: 'Ücretsiz',
  plus: 'Plus',
  premium: 'Premium',
};

export const PLAN_FIELD_LIMITS: Record<TarlaPusulaPlan, number> = {
  free: 1,
  plus: 10,
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
  plus: string | boolean;
  premium: string | boolean;
}> = [
  { key: 'fields', label: 'Aktif tarla', free: '1', plus: '10', premium: 'Sınırsız' },
  { key: 'satellite', label: 'Uydu ve geçmiş', free: 'Temel', plus: 'Gelişmiş', premium: 'Tam kapsam' },
  { key: 'pusula', label: 'Pusula AI', free: 'Temel', plus: 'Gelişmiş', premium: 'Tam kapsam' },
  { key: 'dryland', label: 'Kuru Tarım', free: true, plus: true, premium: true },
  { key: 'irrigation', label: 'Sulama', free: 'Temel', plus: 'Optimizasyon', premium: 'Optimizasyon' },
  { key: 'notifications', label: 'Gelişmiş bildirimler', free: false, plus: true, premium: true },
  { key: 'reports', label: 'Raporlar', free: false, plus: true, premium: true },
  { key: 'widget', label: 'Gelişmiş widget', free: false, plus: true, premium: true },
  { key: 'pusulaPdf', label: 'PusulaPDF', free: false, plus: false, premium: true },
  { key: 'orchard', label: 'Bahçe / ağaç zekâsı', free: false, plus: false, premium: true },
  { key: 'bisip', label: 'BİSİP / soğuklama', free: false, plus: false, premium: true },
  { key: 'storageRisk', label: 'Depo / mikotoksin riski', free: false, plus: false, premium: true },
  { key: 'rotation', label: 'Münavebe / ekim nöbeti', free: false, plus: false, premium: true },
];

export function planAllows(current: TarlaPusulaPlan, required: PaidPlan) {
  return PLAN_ORDER[current] >= PLAN_ORDER[required];
}

export function planPriceLabel(plan: PaidPlan, yearly = false) {
  const prefix = plan === 'plus' ? 'PLUS' : 'PREMIUM';
  const key = yearly
    ? `VITE_${prefix}_YEARLY_PRICE`
    : `VITE_${prefix}_MONTHLY_PRICE`;

  const value = String((import.meta as any)?.env?.[key] ?? '').trim();
  return value || 'Mağazada';
}
