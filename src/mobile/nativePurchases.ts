import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import {
  LOG_LEVEL,
  Purchases,
  STORE_REPLACEMENT_MODE,
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
  type PurchasesStoreProduct,
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
  backendVerified: boolean;
};

// App Store / RevenueCat configuration can choose another offering name.
const OFFERING_ID = String(import.meta.env.VITE_REVENUECAT_OFFERING_ID || 'tarlapusula_plans').trim();

const ENTITLEMENT_IDS: Record<StorePaidPlan, string> = {
  plus: 'tarlapusula_plus',
  premium: 'tarlapusula_premium',
};

function productIdentifierFor(plan: StorePaidPlan, period: StoreBillingPeriod) {
  const envProductId = plan === 'plus'
    ? period === 'monthly'
      ? import.meta.env.VITE_REVENUECAT_PLUS_MONTHLY_PRODUCT_ID
      : import.meta.env.VITE_REVENUECAT_PLUS_ANNUAL_PRODUCT_ID
    : period === 'monthly'
      ? import.meta.env.VITE_REVENUECAT_PREMIUM_MONTHLY_PRODUCT_ID
      : import.meta.env.VITE_REVENUECAT_PREMIUM_ANNUAL_PRODUCT_ID;

  return String(
    envProductId || `com.tarlapusula.${plan}.${period === 'monthly' ? 'monthly' : 'annual'}`,
  ).trim();
}

function findPlanPackage(
  offering: PurchasesOffering | null | undefined,
  plan: StorePaidPlan,
  period: StoreBillingPeriod,
): PurchasesPackage | null {
  const productId = productIdentifierFor(plan, period);
  // Only the exact App Store SKU may be used for a plan, never a package label.
  return offering?.availablePackages?.find(
    (item) => item.product.identifier === productId,
  ) ?? null;
}

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
  if (!nativeStorePurchasesSupported()) return false;
  const prefix = Capacitor.getPlatform() === 'ios' ? 'appl_' : 'goog_';
  return publicApiKey().startsWith(prefix);
}

function activePlanFromCustomerInfo(
  customerInfo: CustomerInfo | null | undefined,
): TarlaPusulaPlan {
  const active = customerInfo?.entitlements?.active ?? {};

  if (active[ENTITLEMENT_IDS.premium] || active.premium) return 'premium';
  if (active[ENTITLEMENT_IDS.plus] || active.plus) return 'plus';
  return 'free';
}

function activeProductIdentifier(
  customerInfo: CustomerInfo | null | undefined,
  plan: TarlaPusulaPlan,
) {
  if (plan !== 'plus' && plan !== 'premium') return null;

  return (
    customerInfo?.entitlements?.active?.[ENTITLEMENT_IDS[plan]]?.productIdentifier ??
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
  const expectedPrefix = Capacitor.getPlatform() === 'ios' ? 'appl_' : 'goog_';
  if (!apiKey.startsWith(expectedPrefix)) {
    throw new Error(
      'Mağaza bağlantısı yapılandırılmamış veya bu cihaz için yanlış RevenueCat public API anahtarı girilmiş.',
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

function offerCandidates(offerings: Awaited<ReturnType<typeof Purchases.getOfferings>>) {
  return [
    offerings.all?.[OFFERING_ID],
    offerings.current,
    ...Object.values(offerings.all ?? {}),
  ].filter((offering): offering is PurchasesOffering => Boolean(offering));
}

function shortStoreErrorCode(error: unknown) {
  if (!error || typeof error !== 'object') return 'none';
  const code = (error as { code?: string | number }).code;
  if (code === undefined || code === null) return 'unknown';
  return String(code).slice(0, 30);
}

async function directAppStoreProducts(ids: string[]): Promise<PurchasesStoreProduct[]> {
  if (Capacitor.getPlatform() !== 'ios') return [];
  const response = await Purchases.getProducts({ productIdentifiers: ids });
  return response.products ?? [];
}

async function offeringForPlan(plan: StorePaidPlan, period: StoreBillingPeriod) {
  await ensureNativePurchasesConfigured();

  const offerings = await Purchases.getOfferings();
  const candidates = [
    offerings.all?.[OFFERING_ID],
    offerings.current,
    ...Object.values(offerings.all ?? {}),
  ].filter((offering): offering is PurchasesOffering => Boolean(offering));

  const offering = candidates.find((entry) =>
    Boolean(findPlanPackage(entry, plan, period)),
  );

  if (!offering) {
    throw new Error(
      `RevenueCat içinde ${plan.toUpperCase()} ${period === 'annual' ? 'yıllık' : 'aylık'} ürünü bulunamadı. App Store ürün kimliği ve RevenueCat offering eşleştirmesini kontrol edin.`,
    );
  }

  return offering;
}

function packageForPeriod(
  offering: PurchasesOffering,
  plan: StorePaidPlan,
  period: StoreBillingPeriod,
): PurchasesPackage {
  const aPackage = findPlanPackage(offering, plan, period);

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

  let offerings: Awaited<ReturnType<typeof Purchases.getOfferings>> | null = null;
  let offeringsError: unknown = null;
  try {
    offerings = await Purchases.getOfferings();
  } catch (error) {
    offeringsError = error;
    console.warn('[RevenueCat] Offering sorgusu başarısız:', error);
  }

  const candidates = offerings ? offerCandidates(offerings) : [];
  const plans = ['plus', 'premium'] as const;
  const prices: StorePlanPrice[] = plans.map((plan) => {
    const monthly = candidates
      .map((offering) => findPlanPackage(offering, plan, 'monthly'))
      .find(Boolean) ?? null;
    const annual = candidates
      .map((offering) => findPlanPackage(offering, plan, 'annual'))
      .find(Boolean) ?? null;

    return {
      plan,
      monthly: priceString(monthly),
      annual: priceString(annual),
      annualMonthlyEquivalent: monthlyEquivalent(annual),
    };
  });

  const missingProductIds = plans.flatMap((plan) => {
    const row = prices.find((price) => price.plan === plan);
    return (['monthly', 'annual'] as const)
      .filter((period) => !row?.[period])
      .map((period) => productIdentifierFor(plan, period));
  });

  let directProducts: PurchasesStoreProduct[] = [];
  let directError: unknown = null;
  if (missingProductIds.length && Capacitor.getPlatform() === 'ios') {
    try {
      // Query Apple's StoreKit independently to distinguish empty offerings
      // from products that are genuinely unavailable in the App Store sandbox.
      directProducts = await directAppStoreProducts(missingProductIds);
      for (const plan of plans) {
        const row = prices.find((price) => price.plan === plan);
        if (!row) continue;
        const monthly = directProducts.find((product) =>
          product.identifier === productIdentifierFor(plan, 'monthly'));
        const annual = directProducts.find((product) =>
          product.identifier === productIdentifierFor(plan, 'annual'));
        if (!row.monthly) row.monthly = monthly?.priceString || null;
        if (!row.annual) row.annual = annual?.priceString || null;
        if (!row.annualMonthlyEquivalent) {
          row.annualMonthlyEquivalent = annual?.pricePerMonthString || null;
        }
      }
    } catch (error) {
      directError = error;
      console.warn('[RevenueCat] Apple StoreKit doğrudan ürün sorgusu başarısız:', error);
    }
  }

  const foundCount = prices.reduce(
    (count, price) => count + Number(Boolean(price.monthly)) + Number(Boolean(price.annual)),
    0,
  );
  if (foundCount === 0) {
    const packageCount = candidates.reduce(
      (count, item) => count + (item.availablePackages?.length ?? 0),
      0,
    );
    throw new Error(
      `TP-IAP-02: RevenueCat paket: ${packageCount}, Apple StoreKit ürün: ${directProducts.length}/4. ` +
      `RC hata kodu: ${shortStoreErrorCode(offeringsError)}; StoreKit hata kodu: ${shortStoreErrorCode(directError)}. ` +
      'Apple sandbox ürün erişimi veya RevenueCat yapılandırması kontrol edilmeli.',
    );
  }

  return prices;
}

async function syncSubscriptionToBackend(): Promise<TarlaPusulaPlan | null> {
  try {
    const { data, error } = await supabase.functions.invoke('send-due-reminders', {
      body: { mode: 'revenuecat_sync' },
    });

    if (error) throw error;
    if (!data?.ok || !['free', 'plus', 'premium'].includes(String(data.plan))) {
      throw new Error('Abonelik doğrulama sunucusu geçerli plan döndürmedi.');
    }

    return data.plan as TarlaPusulaPlan;
  } catch (error) {
    // StoreKit purchase may have succeeded even if the server is temporarily
    // unreachable. Do not report the transaction itself as failed.
    console.warn('[RevenueCat] Sunucu abonelik doğrulaması başarısız:', error);
    return null;
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
    let offering: PurchasesOffering | null = null;
    let aPackage: PurchasesPackage | null = null;
    let directProduct: PurchasesStoreProduct | null = null;

    try {
      offering = await offeringForPlan(plan, period);
      aPackage = packageForPeriod(offering, plan, period);
    } catch (offerError) {
      // A direct StoreKit product is still a RevenueCat-tracked subscription.
      // On iOS allow the exact SKU to be bought even when an offering is empty.
      if (Capacitor.getPlatform() !== 'ios') throw offerError;
      const expected = productIdentifierFor(plan, period);
      const products = await directAppStoreProducts([expected]);
      directProduct = products.find((product) => product.identifier === expected) ?? null;
      if (!directProduct) {
        throw new Error(`TP-IAP-03: Apple StoreKit ${expected} ürününü döndürmedi.`);
      }
    }

    if (offering) {
      await Purchases.trackCustomPaywallImpression({ offering }).catch(() => undefined);
    }

    const currentResult = await Purchases.getCustomerInfo();
    const currentPlan = activePlanFromCustomerInfo(
      currentResult.customerInfo,
    );
    const oldProductIdentifier = activeProductIdentifier(
      currentResult.customerInfo,
      currentPlan,
    );

    let result: Awaited<ReturnType<typeof Purchases.purchasePackage>>;
    if (aPackage) {
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

      result = await Purchases.purchasePackage(purchaseOptions);
    } else if (directProduct) {
      result = await Purchases.purchaseStoreProduct({ product: directProduct });
    } else {
      throw new Error('TP-IAP-03: Satın alınabilir mağaza ürünü bulunamadı.');
    }

    const activePlan = activePlanFromCustomerInfo(
      result.customerInfo,
    );

    emitStorePlan(activePlan);
    const confirmedPlan = await syncSubscriptionToBackend();

    return {
      plan: activePlan,
      cancelled: false,
      backendVerified: activePlan !== 'free' && confirmedPlan === activePlan,
      productIdentifier:
        result.productIdentifier ??
        aPackage?.product.identifier ??
        directProduct?.identifier ??
        null,
    };
  } catch (error) {
    if (isUserCancelledPurchase(error)) {
      return {
        plan: 'free',
        cancelled: true,
        productIdentifier: null,
        backendVerified: false,
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
