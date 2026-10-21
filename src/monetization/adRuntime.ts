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

/** @deprecated Web önizlemede artık kullanılmıyor; gerçek reklam yalnız native bridge üzerinden çalışır. */

async function todayVerifiedAdCount() {
  try {
    const day = turkeyDayKey();
    const start = new Date(`${day}T00:00:00+03:00`);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const { count, error } = await supabase
      .from('ad_reward_claims')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString());
    if (error) throw error;
    return Math.max(0, Number(count) || 0);
  } catch (error) {
    console.warn('[TarlaPusula Ads] Günlük reklam ödülü sayısı okunamadı:', error);
    return 0;
  }
}

async function currentUserId() {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

async function runAd(kind: 'rewarded' | 'interstitial', placement: AdPlacement) {
  const userId = await currentUserId();
  const bridge = typeof window !== 'undefined' ? window.TarlaPusulaAds : undefined;
  const fn = kind === 'rewarded' ? bridge?.showRewarded : bridge?.showInterstitial;

  /*
    Gerçek reklam yalnız native Android/iOS köprüsü mevcutsa gösterilir.
    StackBlitz, Vercel ve normal web önizlemesinde sahte reklam UI'sı
    gösterilmez.

    Rewarded akışında web önizleme "başarılı" kabul edilir ki kullanıcı
    özelliği test edebilsin; ancak provider / transactionId olmadığı için
    reklam puanı claim edilmez. Interstitial ise webde tamamen atlanır.
  */
  if (!fn) {
    return kind === 'rewarded'
      ? ({ completed: true, shown: false } satisfies BridgeAdResult)
      : ({ completed: false, shown: false } satisfies BridgeAdResult);
  }

  const result = await fn({ placement, userId });
  return result ? { ...result, shown: true } : { completed: false, shown: true };
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
    return { completed: false, claim: null, reason: 'dismissed' } as const;
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
  if (!canShowInterstitialNow()) {
    return { shown: false, rewarded: false };
  }

  // Kullanıcı bugün 5 reklam ödülünü zaten aldıysa artık reklam göstermiyoruz.
  if ((await todayVerifiedAdCount()) >= 5) {
    return { shown: false, rewarded: false };
  }

  const ad = await runAd('interstitial', placement);
  if (ad.shown === false) {
    return { shown: false, rewarded: false };
  }

  // Kullanıcı reklamı kapatsa bile aynı yerde hemen tekrar reklam çıkarmıyoruz.
  const state = readInterstitialState();
  writeInterstitialState({
    day: state.day,
    count: state.count + 1,
    lastAt: Date.now(),
  });

  // Interstitial reklam puan kazandırmaz. Puan yalnız kullanıcının
  // isteyerek başlattığı rewarded reklam + doğrulanmış SSV ile verilir.
  return {
    shown: true,
    rewarded: false,
    completed: Boolean(ad.completed),
  };
}
