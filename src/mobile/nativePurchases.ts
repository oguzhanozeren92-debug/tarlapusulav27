import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import {
  LOG_LEVEL,
  Purchases,
  STORE_REPLACEMENT_MODE,
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from '@revenuecat/purchases-capacitor';
import { supabase } from '../supabaseClient';
import type { TarlaPusulaPlan } from '../entitlements/useEntitlementStore';

export type StorePaidPlan = 'plus' | 'premium';
export type StoreBillingPeriod = 'monthly' | 'annual';

export type StorePlanPrice = {
  plan: StorePaidPlan;
  monthly: string | null;
  annual: string | null;
  annualMonthlyEquivalent: string | null;
};

export type StorePurchaseResult = {
  plan: TarlaPusulaPlan;
  cancelled: boolean;
  productIdentifier: string | null;
};

const OFFERING_IDS: Record<StorePaidPlan, string> = {
  plus: 'plus',
  premium: 'premium',
};

const ENTITLEMENT_IDS: Record<StorePaidPlan, string> = {
  plus: 'plus',
  premium: 'premium',
};

let configuredUserId = '';
let configurePromise: Promise<void> | null = null;

function publicApiKey() {
  const platform = Capacitor.getPlatform();

  if (platform === 'ios') {
    return String(
      import.meta.env.VITE_REVENUECAT_IOS_PUBLIC_KEY ?? '',
    ).trim();
  }

  if (platform === 'android') {
    return String(
      import.meta.env.VITE_REVENUECAT_ANDROID_PUBLIC_KEY ?? '',
    ).trim();
  }

  return '';
}

export function nativeStorePurchasesSupported() {
  return (
    Capacitor.isNativePlatform() &&
    Capacitor.isPluginAvailable('Purchases')
  );
}

export function nativeStorePurchasesConfigured() {
  return nativeStorePurchasesSupported() && Boolean(publicApiKey());
}

function activePlanFromCustomerInfo(
  customerInfo: CustomerInfo | null | undefined,
): TarlaPusulaPlan {
  const active = customerInfo?.entitlements?.active ?? {};

  if (active[ENTITLEMENT_IDS.premium]) return 'premium';
  if (active[ENTITLEMENT_IDS.plus]) return 'plus';
  return 'free';
}

function activeProductIdentifier(
  customerInfo: CustomerInfo | null | undefined,
  plan: TarlaPusulaPlan,
) {
  if (plan !== 'plus' && plan !== 'premium') return null;

  return (
    customerInfo?.entitlements?.active?.[plan]?.productIdentifier ??
    null
  );
}

async function currentSupabaseUserId() {
  if (!supabase) {
    throw new Error('Supabase bağlantısı hazır değil.');
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  if (!user) {
    throw new Error('Abonelik işlemi için giriş yapmalısın.');
  }

  return user.id;
}

export async function ensureNativePurchasesConfigured() {
  if (!nativeStorePurchasesSupported()) {
    throw new Error('Mağaza abonelikleri yalnız mobil uygulamada kullanılabilir.');
  }

  const apiKey = publicApiKey();
  if (!apiKey) {
    throw new Error(
      'Mağaza bağlantısı henüz yapılandırılmadı. RevenueCat public API anahtarı eksik.',
    );
  }

  const userId = await currentSupabaseUserId();

  if (configurePromise) {
    await configurePromise;
  }

  if (configuredUserId === userId) return;

  configurePromise = (async () => {
    const configured = await Purchases.isConfigured();

    if (!configured.isConfigured) {
      await Purchases.setLogLevel({
        level: import.meta.env.DEV ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN,
      });

      await Purchases.configure({
        apiKey,
        appUserID: userId,
      });

      configuredUserId = userId;
      return;
    }

    const current = await Purchases.getAppUserID();

    if (current.appUserID !== userId) {
      await Purchases.logIn({ appUserID: userId });
    }

    configuredUserId = userId;
  })();

  try {
    await configurePromise;
  } finally {
    configurePromise = null;
  }
}

async function offeringForPlan(plan: StorePaidPlan) {
  await ensureNativePurchasesConfigured();

  const offerings = await Purchases.getOfferings();
  const offering =
    offerings.all?.[OFFERING_IDS[plan]] ??
    (offerings.current?.identifier === OFFERING_IDS[plan]
      ? offerings.current
      : null);

  if (!offering) {
    throw new Error(
      `${plan === 'plus' ? 'Plus' : 'Premium'} mağaza paketi RevenueCat'te bulunamadı.`,
    );
  }

  return offering;
}

function packageForPeriod(
  offering: PurchasesOffering,
  period: StoreBillingPeriod,
): PurchasesPackage {
  const aPackage =
    period === 'annual' ? offering.annual : offering.monthly;

  if (!aPackage) {
    throw new Error(
      period === 'annual'
        ? 'Yıllık mağaza paketi henüz tanımlı değil.'
        : 'Aylık mağaza paketi henüz tanımlı değil.',
    );
  }

  return aPackage;
}

function priceString(
  aPackage: PurchasesPackage | null | undefined,
) {
  return aPackage?.product?.priceString || null;
}

function monthlyEquivalent(
  aPackage: PurchasesPackage | null | undefined,
) {
  return aPackage?.product?.pricePerMonthString || null;
}

export async function getNativeStorePrices(): Promise<StorePlanPrice[]> {
  if (!nativeStorePurchasesConfigured()) return [];

  await ensureNativePurchasesConfigured();
  const offerings = await Purchases.getOfferings();

  return (['plus', 'premium'] as const).map((plan) => {
    const offering =
      offerings.all?.[OFFERING_IDS[plan]] ??
      (offerings.current?.identifier === OFFERING_IDS[plan]
        ? offerings.current
        : null);

    return {
      plan,
      monthly: priceString(offering?.monthly),
      annual: priceString(offering?.annual),
      annualMonthlyEquivalent: monthlyEquivalent(offering?.annual),
    };
  });
}

async function syncSubscriptionToBackend() {
  if (!supabase) return;

  const { error } = await supabase.functions.invoke('send-due-reminders', {
    body: {
      mode: 'revenuecat_sync',
    },
  });

  if (error) {
    console.warn(
      '[RevenueCat] Supabase abonelik senkronu tamamlanamadı:',
      error.message,
    );
  }
}

function emitStorePlan(plan: TarlaPusulaPlan) {
  window.dispatchEvent(
    new CustomEvent('tp:store-entitlements-changed', {
      detail: { plan },
    }),
  );
}

function isUserCancelledPurchase(error: unknown) {
  const value = error as {
    code?: string | number;
    message?: string;
    userCancelled?: boolean;
  };

  if (value?.userCancelled) return true;

  const code = String(value?.code ?? '').toLowerCase();
  const message = String(value?.message ?? '').toLowerCase();

  return (
    code === '1' ||
    code.includes('purchase_cancelled') ||
    message.includes('cancel')
  );
}

export async function purchaseStorePlan(
  plan: StorePaidPlan,
  period: StoreBillingPeriod,
): Promise<StorePurchaseResult> {
  try {
    const offering = await offeringForPlan(plan);
    const aPackage = packageForPeriod(offering, period);

    await Purchases.trackCustomPaywallImpression({
      offering,
    }).catch(() => undefined);

    const currentResult = await Purchases.getCustomerInfo();
    const currentPlan = activePlanFromCustomerInfo(
      currentResult.customerInfo,
    );
    const oldProductIdentifier = activeProductIdentifier(
      currentResult.customerInfo,
      currentPlan,
    );

    const purchaseOptions: Parameters<typeof Purchases.purchasePackage>[0] = {
      aPackage,
    };

    if (
      Capacitor.getPlatform() === 'android' &&
      oldProductIdentifier &&
      currentPlan !== 'free' &&
      currentPlan !== plan
    ) {
      purchaseOptions.storeProductChangeInfo = {
        oldProductIdentifier,
        replacementMode: STORE_REPLACEMENT_MODE.WITH_TIME_PRORATION,
      };
    }

    const result = await Purchases.purchasePackage(purchaseOptions);

    const activePlan = activePlanFromCustomerInfo(
      result.customerInfo,
    );

    emitStorePlan(activePlan);
    await syncSubscriptionToBackend();

    return {
      plan: activePlan,
      cancelled: false,
      productIdentifier:
        result.productIdentifier ??
        aPackage.product.identifier ??
        null,
    };
  } catch (error) {
    if (isUserCancelledPurchase(error)) {
      return {
        plan: 'free',
        cancelled: true,
        productIdentifier: null,
      };
    }

    throw error;
  }
}

export async function restoreStorePurchases(): Promise<TarlaPusulaPlan> {
  await ensureNativePurchasesConfigured();

  const { customerInfo } = await Purchases.restorePurchases();
  const plan = activePlanFromCustomerInfo(customerInfo);

  emitStorePlan(plan);
  await syncSubscriptionToBackend();

  return plan;
}

export async function refreshNativeStorePlan(): Promise<TarlaPusulaPlan | null> {
  if (!nativeStorePurchasesConfigured()) return null;

  await ensureNativePurchasesConfigured();

  const { customerInfo } = await Purchases.getCustomerInfo();
  const plan = activePlanFromCustomerInfo(customerInfo);

  emitStorePlan(plan);
  await syncSubscriptionToBackend();

  return plan;
}

export async function resetNativePurchasesUser() {
  if (!nativeStorePurchasesSupported()) return;

  try {
    const configured = await Purchases.isConfigured();
    if (configured.isConfigured) {
      await Purchases.logOut();
    }
  } catch {
    // Oturum kapanışı mağaza SDK'sı yüzünden engellenmez.
  } finally {
    configuredUserId = '';
  }
}


export async function manageNativeStoreSubscription() {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Abonelik yönetimi mobil uygulamada kullanılabilir.');
  }

  const url =
    Capacitor.getPlatform() === 'ios'
      ? 'https://apps.apple.com/account/subscriptions'
      : 'https://play.google.com/store/account/subscriptions';

  await Browser.open({ url });
}
