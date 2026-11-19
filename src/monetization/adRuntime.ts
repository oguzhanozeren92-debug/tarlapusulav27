import { supabase } from '../supabaseClient';

export type AdPlacement =
  | 'points_hub'
  | 'ai_extra_analysis'
  | 'satellite_history'
  | 'agenda_deep_read';

type BridgeAdResult = {
  completed: boolean;
  shown?: boolean;
  provider?: string;
  transactionId?: string;
  verificationPayload?: Record<string, unknown>;
};

type TarlaPusulaAdsBridge = {
  showRewarded?: (input: {
    placement: AdPlacement;
    userId?: string | null;
  }) => Promise<BridgeAdResult>;
  showInterstitial?: (input: {
    placement: AdPlacement;
    userId?: string | null;
  }) => Promise<BridgeAdResult>;
};

declare global {
  interface Window {
    TarlaPusulaAds?: TarlaPusulaAdsBridge;
  }
}

export type RewardedAdClaimResult = {
  ok: boolean;
  pending?: boolean;
  awarded: boolean;
  awardedPoints: number;
  reason: string;
  points: number;
  lifetimePoints: number;
  dailyCount: number;
  dailyLimit: number;
  aiCreditGranted: boolean;
};

const INTERSTITIAL_MIN_GAP_MS = 45 * 60 * 1000;
const INTERSTITIAL_DAILY_LIMIT = 2;
const INTERSTITIAL_STORAGE_KEY = 'tp_free_interstitial_policy_v1';
let interstitialInFlight = false;

function turkeyDayKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function readInterstitialState() {
  try {
    const raw = window.localStorage.getItem(INTERSTITIAL_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || parsed.day !== turkeyDayKey()) {
      return { day: turkeyDayKey(), count: 0, lastAt: 0 };
    }
    return {
      day: turkeyDayKey(),
      count: Math.max(0, Number(parsed.count) || 0),
      lastAt: Math.max(0, Number(parsed.lastAt) || 0),
    };
  } catch {
    return { day: turkeyDayKey(), count: 0, lastAt: 0 };
  }
}

function writeInterstitialState(next: { day: string; count: number; lastAt: number }) {
  try {
    window.localStorage.setItem(INTERSTITIAL_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Tarayıcı depolaması kapalıysa reklam gösterimini engelleme.
  }
}

function canShowInterstitialNow() {
  if (typeof window === 'undefined') return false;
  const state = readInterstitialState();
  if (state.count >= INTERSTITIAL_DAILY_LIMIT) return false;
  if (state.lastAt && Date.now() - state.lastAt < INTERSTITIAL_MIN_GAP_MS) return false;
  return true;
}

async function currentUserId() {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

async function runAd(kind: 'rewarded' | 'interstitial', placement: AdPlacement) {
  // An interstitial must not depend on a Supabase session or network request.
  const userId = kind === 'rewarded' ? await currentUserId() : null;
  const bridge = typeof window !== 'undefined' ? window.TarlaPusulaAds : undefined;
  const fn = kind === 'rewarded' ? bridge?.showRewarded : bridge?.showInterstitial;

  // No synthetic success in web previews; only actual native display counts.
  if (!fn) return { completed: false, shown: false } satisfies BridgeAdResult;

  const result = await fn({ placement, userId });
  return result ?? { completed: false, shown: false };

}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function claimAdReward(placement: AdPlacement, ad: BridgeAdResult) {
  if (!ad.completed || !ad.provider || !ad.transactionId) {
    return null;
  }

  const attempts = ad.provider === 'admob_ssv' ? 9 : 1;
  let lastData: RewardedAdClaimResult | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const { data, error } = await supabase.functions.invoke<RewardedAdClaimResult>(
      'rewarded-ad-claim',
      {
        body: {
          placement,
          provider: ad.provider,
          transactionId: ad.transactionId,
          verificationPayload: ad.verificationPayload ?? {},
          metadata: {
            source: 'tarlapusula_ad_runtime',
          },
        },
      },
    );

    if (error) throw error;
    if (!data?.ok) {
      throw new Error((data as any)?.error ?? 'Reklam ödülü doğrulanamadı.');
    }

    lastData = data;

    if (!data.pending) {
      return data;
    }

    if (attempt < attempts - 1) {
      await delay(700);
    }
  }

  return lastData;
}

export async function showRewardedAdAndClaim(placement: AdPlacement) {
  const ad = await runAd('rewarded', placement);
  if (!ad.completed) {
    return {
      completed: false,
      claim: null,
      reason: ad.shown ? 'dismissed' : 'unavailable',
    } as const;
  }

  const claim = await claimAdReward(placement, ad);
  return { completed: true, claim, reason: 'completed' } as const;
}

/**
 * Ücretsiz kullanıcıda seyrek tam ekran reklam.
 * En fazla 2/gün, iki reklam arası en az 45 dakika.
 * Reklam kapatılırsa kullanıcının hedef ekranı yine açılır.
 */
export async function maybeShowFreeInterstitial(placement: AdPlacement) {
  if (interstitialInFlight || !canShowInterstitialNow()) {
    return { shown: false, rewarded: false };
  }

  interstitialInFlight = true;
  try {
    // Rewarded-ad daily caps are independent of interstitial frequency.
    // Never block an interstitial because other users received rewards.
    const ad = await runAd('interstitial', placement);
    if (!ad.shown) {
      return { shown: false, rewarded: false };
    }

    // Count only a genuinely displayed ad; UMP / no-fill failures must not
    // consume the user's daily cap or start the 45-minute cooldown.
    const state = readInterstitialState();
    writeInterstitialState({
      day: state.day,
      count: state.count + 1,
      lastAt: Date.now(),
    });

    return {
      shown: true,
      rewarded: false,
      completed: Boolean(ad.completed),
    };
  } finally {
    interstitialInFlight = false;
  }
}
