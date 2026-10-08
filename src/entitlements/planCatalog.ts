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
  | 'weatherAdvanced'
  | 'reports'
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
  { key: 'weatherAdvanced', label: 'Gelişmiş hava / tarla iklimi', free: false, plus: true, premium: true },
  { key: 'reports', label: 'Raporlar', free: false, plus: true, premium: true },
  { key: 'pusulaPdf', label: 'PusulaPDF', free: false, plus: false, premium: true },
  { key: 'orchard', label: 'Bahçe / ağaç zekâsı', free: false, plus: false, premium: true },
  { key: 'bisip', label: 'BİSİP / soğuklama', free: false, plus: false, premium: true },
  { key: 'storageRisk', label: 'Depo / mikotoksin riski', free: false, plus: false, premium: true },
  { key: 'rotation', label: 'Münavebe / ekim nöbeti', free: false, plus: false, premium: true },
];

export function planAllows(current: TarlaPusulaPlan, required: PaidPlan) {
  return PLAN_ORDER[current] >= PLAN_ORDER[required];
}

export const PLAN_LAUNCH_PRICES = {
  plus: {
    monthly: '₺200 / ay',
    yearly: '₺1.920 / yıl',
    yearlyMonthlyEquivalent: '₺160 / ay eşdeğer',
  },
  premium: {
    monthly: '₺250 / ay',
    yearly: '₺2.400 / yıl',
    yearlyMonthlyEquivalent: '₺200 / ay eşdeğer',
  },
} as const;

function usableConfiguredPrice(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  const normalized = raw
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ');

  if (
    normalized === 'mağazada' ||
    normalized === 'magazada' ||
    normalized === 'store' ||
    normalized === 'n/a' ||
    normalized === '-'
  ) {
    return '';
  }

  return raw;
}

export function planPriceLabel(plan: PaidPlan, yearly = false) {
  const prefix = plan === 'plus' ? 'PLUS' : 'PREMIUM';
  const key = yearly
    ? `VITE_${prefix}_YEARLY_PRICE`
    : `VITE_${prefix}_MONTHLY_PRICE`;

  const configured = usableConfiguredPrice((import.meta as any)?.env?.[key]);
  if (configured) return configured;

  const launch = PLAN_LAUNCH_PRICES[plan];
  return yearly ? launch.yearly : launch.monthly;
}

export function planYearlyEquivalentLabel(plan: PaidPlan) {
  return PLAN_LAUNCH_PRICES[plan].yearlyMonthlyEquivalent;
}
