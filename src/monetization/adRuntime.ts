import { getEntitlementSnapshot } from '../entitlements/useEntitlementStore';
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

const INTERSTITIAL_MIN_GAP_MS = 25 * 60 * 1000;
const INTERSTITIAL_DAILY_LIMIT = 3;
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
  const entitlement = getEntitlementSnapshot();
  if (entitlement.effectivePlan !== 'free') return false;

  const state = readInterstitialState();
  if (state.count >= INTERSTITIAL_DAILY_LIMIT) return false;
  if (state.lastAt && Date.now() - state.lastAt < INTERSTITIAL_MIN_GAP_MS) return false;
  return true;
}

/** @deprecated Web önizlemede artık kullanılmıyor; gerçek reklam yalnız native bridge üzerinden çalışır. */
function showDevMockAd(kind: 'rewarded' | 'interstitial', placement: AdPlacement) {
  return new Promise<BridgeAdResult>((resolve) => {
    if (typeof document === 'undefined') {
      resolve({ completed: false });
      return;
    }

    const seconds = kind === 'rewarded' ? 6 : 4;
    let remaining = seconds;
    let done = false;

    const overlay = document.createElement('div');
    overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:2147483647',
      'display:grid',
      'place-items:center',
      'padding:18px',
      'background:rgba(0,0,0,.78)',
      'backdrop-filter:blur(10px)',
      '-webkit-backdrop-filter:blur(10px)',
      'font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    ].join(';');

    const card = document.createElement('div');
    card.style.cssText = [
      'width:min(92vw,390px)',
      'border:1px solid rgba(255,255,255,.22)',
      'border-radius:22px',
      'overflow:hidden',
      'background:#0d0f11',
      'color:#fff',
      'box-shadow:0 28px 80px rgba(0,0,0,.5)',
    ].join(';');

    const visual = document.createElement('div');
    visual.style.cssText = [
      'min-height:210px',
      'display:grid',
      'place-items:center',
      'padding:24px',
      'text-align:center',
      'background:radial-gradient(circle at 50% 20%,rgba(255,255,255,.14),transparent 30%),linear-gradient(145deg,#171a1d,#050607)',
    ].join(';');
    visual.innerHTML = `
      <div>
        <div style="font-size:10px;font-weight:900;letter-spacing:.14em;color:#aeb4ba">TEST REKLAMI</div>
        <div style="margin-top:12px;font-size:24px;font-weight:950;line-height:1.05">TarlaPusula reklam yerleşimi</div>
        <div style="margin-top:9px;font-size:12px;line-height:1.5;color:#c9ced3">${placement.replaceAll('_', ' ')}</div>
      </div>
    `;

    const footer = document.createElement('div');
    footer.style.cssText = 'padding:14px;background:#fff;color:#111';

    const progress = document.createElement('div');
    progress.style.cssText = 'height:5px;border-radius:999px;background:#e8ebee;overflow:hidden';
    const bar = document.createElement('i');
    bar.style.cssText = 'display:block;height:100%;width:0;background:#111;transition:width .25s linear';
    progress.appendChild(bar);

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px';

    const text = document.createElement('div');
    text.style.cssText = 'font-size:11px;line-height:1.4;color:#59616a';
    text.textContent = kind === 'rewarded'
      ? `Reklam tamamlanınca +10 P kazanırsın · ${remaining} sn`
      : `Kısa reklam · ${remaining} sn`;

    const button = document.createElement('button');
    button.type = 'button';
    button.disabled = true;
    button.textContent = 'Bekle…';
    button.style.cssText = [
      'min-width:112px',
      'height:40px',
      'border:0',
      'border-radius:12px',
      'background:#111',
      'color:#fff',
      'font-weight:900',
      'cursor:pointer',
      'opacity:.55',
    ].join(';');

    const finish = (completed: boolean) => {
      if (done) return;
      done = true;
      window.clearInterval(timer);
      overlay.remove();
      resolve({
        completed,
        shown: true,
        provider: 'dev_mock',
        transactionId: completed ? `dev-${placement}-${crypto.randomUUID()}` : undefined,
        verificationPayload: completed ? { test: true } : undefined,
      });
    };

    button.onclick = () => finish(true);

    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Reklamı kapat');
    close.style.cssText = [
      'position:absolute',
      'top:16px',
      'right:16px',
      'width:38px',
      'height:38px',
      'border:1px solid rgba(255,255,255,.3)',
      'border-radius:12px',
      'background:rgba(0,0,0,.46)',
      'color:#fff',
      'font-size:25px',
      'line-height:1',
      'cursor:pointer',
    ].join(';');
    close.onclick = () => finish(false);

    row.append(text, button);
    footer.append(progress, row);
    card.append(visual, footer);
    overlay.append(card, close);
    document.body.appendChild(overlay);

    const timer = window.setInterval(() => {
      remaining -= 1;
      const elapsed = seconds - remaining;
      bar.style.width = `${Math.min(100, (elapsed / seconds) * 100)}%`;
      if (remaining <= 0) {
        window.clearInterval(timer);
        text.textContent = kind === 'rewarded'
          ? 'Reklam tamamlandı · +10 P ödülünü al'
          : 'Reklam tamamlandı';
        button.disabled = false;
        button.style.opacity = '1';
        button.textContent = kind === 'rewarded' ? '+10 P Al' : 'Devam Et';
      } else {
        text.textContent = kind === 'rewarded'
          ? `Reklam tamamlanınca +10 P kazanırsın · ${remaining} sn`
          : `Kısa reklam · ${remaining} sn`;
      }
    }, 1000);
  });
}


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
  const entitlement = getEntitlementSnapshot();
  if (entitlement.effectivePlan !== 'free') {
    return {
      completed: false,
      claim: null,
      reason: 'paid_plan_no_ads',
    } as const;
  }

  const ad = await runAd('rewarded', placement);
  if (!ad.completed) {
    return { completed: false, claim: null, reason: 'dismissed' } as const;
  }

  const claim = await claimAdReward(placement, ad);
  return { completed: true, claim, reason: 'completed' } as const;
}

/**
 * Ücretsiz kullanıcıda seyrek tam ekran reklam.
 * En fazla 3/gün, iki reklam arası en az 25 dakika.
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
