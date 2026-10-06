import { Capacitor } from '@capacitor/core';
import {
  AdMob,
  AdmobConsentStatus,
  MaxAdContentRating,
  type AdmobConsentInfo,
} from '@capacitor-community/admob';
import { supabase } from '../supabaseClient';
import type { AdPlacement } from '../monetization/adRuntime';

const ANDROID_PRODUCTION_REWARDED_ID =
  'ca-app-pub-9321324588059191/4148774701';

const ANDROID_PRODUCTION_INTERSTITIAL_ID =
  'ca-app-pub-9321324588059191/9017958001';

const IOS_PRODUCTION_REWARDED_ID =
  'ca-app-pub-9321324588059191/9153689375';

const TEST_UNITS = {
  android: {
    rewarded: 'ca-app-pub-3940256099942544/5224354917',
    interstitial: 'ca-app-pub-3940256099942544/1033173712',
  },
  ios: {
    rewarded: 'ca-app-pub-3940256099942544/1712485313',
    interstitial: 'ca-app-pub-3940256099942544/4411468910',
  },
} as const;

let initPromise: Promise<boolean> | null = null;
let bridgeInstalled = false;

type AdKind = 'rewarded' | 'interstitial';

function env(name: string) {
  return String((import.meta.env as Record<string, unknown>)[name] ?? '').trim();
}

function platformUnits() {
  const platform = Capacitor.getPlatform();
  if (platform !== 'android' && platform !== 'ios') {
    throw new Error('AdMob yalnız native iOS/Android uygulamada kullanılabilir.');
  }

  const prefix = platform === 'ios' ? 'IOS' : 'ANDROID';
  const forceTesting =
    import.meta.env.DEV ||
    env('VITE_ADMOB_TEST_MODE').toLowerCase() === 'true';

  const rewardedProd =
    env(`VITE_ADMOB_${prefix}_REWARDED_ID`) ||
    (platform === 'android'
      ? ANDROID_PRODUCTION_REWARDED_ID
      : IOS_PRODUCTION_REWARDED_ID);
  const interstitialProd =
    env(`VITE_ADMOB_${prefix}_INTERSTITIAL_ID`) ||
    (platform === 'android' ? ANDROID_PRODUCTION_INTERSTITIAL_ID : '');

  return {
    rewarded: forceTesting || !rewardedProd
      ? { id: TEST_UNITS[platform].rewarded, testing: true }
      : { id: rewardedProd, testing: false },
    interstitial: forceTesting || !interstitialProd
      ? { id: TEST_UNITS[platform].interstitial, testing: true }
      : { id: interstitialProd, testing: false },
  };
}

function makeNonce() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `tp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function consentReady() {
  let info: AdmobConsentInfo = await AdMob.requestConsentInfo();

  if (
    info.isConsentFormAvailable &&
    info.status === AdmobConsentStatus.REQUIRED
  ) {
    info = await AdMob.showConsentForm();
  }

  return info.canRequestAds;
}

export function isNativeAdMobAvailable() {
  return (
    Capacitor.isNativePlatform() &&
    Capacitor.isPluginAvailable('AdMob')
  );
}

export async function ensureNativeAdMobReady() {
  if (!isNativeAdMobAvailable()) return false;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const canRequestAds = await consentReady();
    if (!canRequestAds) return false;

    await AdMob.initialize({
      initializeForTesting:
        import.meta.env.DEV ||
        env('VITE_ADMOB_TEST_MODE').toLowerCase() === 'true',
      maxAdContentRating: MaxAdContentRating.ParentalGuidance,
    });

    return true;
  })();

  try {
    return await initPromise;
  } catch (error) {
    initPromise = null;
    throw error;
  }
}

async function currentUserId() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  return user?.id ?? null;
}

function ssvCustomData(placement: AdPlacement, nonce: string) {
  return JSON.stringify({
    v: 1,
    p: placement,
    n: nonce,
  });
}

async function showRewarded(placement: AdPlacement) {
  const ready = await ensureNativeAdMobReady();
  if (!ready) {
    return {
      completed: false,
      shown: false,
      provider: 'admob',
    };
  }

  const userId = await currentUserId();
  if (!userId) {
    throw new Error('Ödüllü reklam için kullanıcı oturumu gerekli.');
  }

  const units = platformUnits();
  const nonce = makeNonce();

  await AdMob.prepareRewardVideoAd({
    adId: units.rewarded.id,
    isTesting: units.rewarded.testing,
    ssv: {
      userId,
      customData: ssvCustomData(placement, nonce),
    },
  });

  const reward = await AdMob.showRewardVideoAd({
    adId: units.rewarded.id,
  });

  return {
    completed: true,
    shown: true,
    provider: units.rewarded.testing ? 'admob_test' : 'admob_ssv',
    transactionId: nonce,
    verificationPayload: {
      test: units.rewarded.testing,
      rewardAmount: Number(reward.amount) || 0,
      rewardType: String(reward.type || ''),
      nonce,
    },
  };
}

async function showInterstitial() {
  const ready = await ensureNativeAdMobReady();
  if (!ready) {
    return {
      completed: false,
      shown: false,
      provider: 'admob',
    };
  }

  const units = platformUnits();

  await AdMob.prepareInterstitial({
    adId: units.interstitial.id,
    isTesting: units.interstitial.testing,
  });

  await AdMob.showInterstitial({
    adId: units.interstitial.id,
  });

  return {
    completed: true,
    shown: true,
    provider: units.interstitial.testing ? 'admob_test' : 'admob',
    transactionId: makeNonce(),
    verificationPayload: {
      test: units.interstitial.testing,
    },
  };
}

export async function showAdMobPrivacyOptions() {
  if (!isNativeAdMobAvailable()) return false;

  try {
    await AdMob.showPrivacyOptionsForm();
    return true;
  } catch (error) {
    console.info('[AdMob] Gizlilik seçenekleri gösterilemedi:', error);
    return false;
  }
}

export function installNativeAdsBridge() {
  if (
    bridgeInstalled ||
    typeof window === 'undefined' ||
    !isNativeAdMobAvailable()
  ) {
    return;
  }

  bridgeInstalled = true;

  window.TarlaPusulaAds = {
    showRewarded: async ({ placement }) => showRewarded(placement),
    showInterstitial: async () => showInterstitial(),
  };

  window.addEventListener('tp:ad-privacy-options', () => {
    void showAdMobPrivacyOptions();
  });
}
