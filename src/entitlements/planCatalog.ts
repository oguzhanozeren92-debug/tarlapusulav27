import type { TarlaPusulaPlan } from './useEntitlementStore';

export type PaidPlan = 'plus' | 'premium';

export const PLAN_ORDER: Record<TarlaPusulaPlan, number> = {
  free: 0,
  plus: 1,
  premium: 2,
};

export const PLAN_LABELS: Record<TarlaPusulaPlan, string> = {
  free: 'Ücretsiz',
  plus: 'Ücretsiz',
  premium: 'Ücretsiz',
};

export const PLAN_FIELD_LIMITS: Record<TarlaPusulaPlan, number> = {
  free: 999,
  plus: 999,
  premium: 999,
};

export type PlanFeatureKey =
  | 'fields'
  | 'satellite'
  | 'pusula'
  | 'dryland'
  | 'irrigation'
  | 'notifications'
  | 'weatherAdvanced'
  | 'reports'
  | 'pusulaPdf'
  | 'orchard'
  | 'bisip'
  | 'storageRisk'
  | 'rotation';

// Compatibility catalog: there are no paid or restricted features.
export const PLAN_FEATURE_MATRIX: Array<{
  key: PlanFeatureKey;
  label: string;
  free: string | boolean;
  plus: string | boolean;
  premium: string | boolean;
}> = [
  { key: 'fields', label: 'Aktif tarla', free: 'Sınırsız', plus: 'Sınırsız', premium: 'Sınırsız' },
  { key: 'satellite', label: 'Uydu ve geçmiş', free: 'Tam kapsam', plus: 'Tam kapsam', premium: 'Tam kapsam' },
  { key: 'pusula', label: 'Pusula AI', free: 'Tam kapsam', plus: 'Tam kapsam', premium: 'Tam kapsam' },
  { key: 'dryland', label: 'Kuru Tarım', free: true, plus: true, premium: true },
  { key: 'irrigation', label: 'Sulama', free: true, plus: true, premium: true },
  { key: 'notifications', label: 'Gelişmiş bildirimler', free: true, plus: true, premium: true },
  { key: 'weatherAdvanced', label: 'Gelişmiş hava / tarla iklimi', free: true, plus: true, premium: true },
  { key: 'reports', label: 'Raporlar', free: true, plus: true, premium: true },
  { key: 'pusulaPdf', label: 'PusulaPDF', free: true, plus: true, premium: true },
  { key: 'orchard', label: 'Bahçe / ağaç zekâsı', free: true, plus: true, premium: true },
  { key: 'bisip', label: 'BİSİP / soğuklama', free: true, plus: true, premium: true },
  { key: 'storageRisk', label: 'Depo / mikotoksin riski', free: true, plus: true, premium: true },
  { key: 'rotation', label: 'Münavebe / ekim nöbeti', free: true, plus: true, premium: true },
];

export function planAllows(_current: TarlaPusulaPlan, _required: PaidPlan) {
  return true;
}

// Legacy compatibility: old pricing helpers must never offer a purchase.
export const PLAN_LAUNCH_PRICES = {
  plus: { monthly: 'Ücretsiz', yearly: 'Ücretsiz', yearlyMonthlyEquivalent: 'Ücretsiz' },
  premium: { monthly: 'Ücretsiz', yearly: 'Ücretsiz', yearlyMonthlyEquivalent: 'Ücretsiz' },
} as const;

export function planPriceLabel(_plan: PaidPlan, _yearly = false) {
  return 'Ücretsiz';
}

export function planYearlyEquivalentLabel(_plan: PaidPlan) {
  return 'Ücretsiz';
}
