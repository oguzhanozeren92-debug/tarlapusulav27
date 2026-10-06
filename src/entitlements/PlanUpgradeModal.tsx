import { useEffect, useMemo, useState } from 'react';
import { Check, LockKeyhole, RotateCcw, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import {
  refreshEntitlements,
  useEntitlementStore,
} from './useEntitlementStore';
import {
  PLAN_FEATURE_MATRIX,
  PLAN_LABELS,
  planAllows,
  planPriceLabel,
  type PaidPlan,
} from './planCatalog';
import {
  PLAN_UPGRADE_EVENT,
  type PlanUpgradeRequest,
} from './planAccess';
import {
  getNativeStorePrices,
  manageNativeStoreSubscription,
  nativeStorePurchasesConfigured,
  nativeStorePurchasesSupported,
  purchaseStorePlan,
  restoreStorePurchases,
  type StorePlanPrice,
} from '../mobile/nativePurchases';

const CSS = String.raw`
.tp-plan-gate-backdrop{
  position:fixed;inset:0;z-index:2147483400;border:0;padding:0;
  background:rgba(12,14,17,.66);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)
}
.tp-plan-gate{
  position:fixed;z-index:2147483500;left:50%;top:50%;transform:translate(-50%,-50%);
  width:min(96vw,1040px);max-height:min(92dvh,880px);overflow:hidden;display:flex;flex-direction:column;
  border:1px solid #d8dde2;border-radius:26px;background:#fff;color:#16191d;
  box-shadow:0 32px 90px rgba(0,0,0,.34);font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif
}
.tp-plan-gate-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:18px 20px 14px;border-bottom:1px solid #e9edf0}
.tp-plan-gate-head small{display:block;margin-bottom:5px;color:#68727c;font-size:8px;font-weight:900;letter-spacing:.14em}
.tp-plan-gate-head h2{margin:0;font-size:23px;line-height:1.05;letter-spacing:-.035em}
.tp-plan-gate-head p{margin:7px 0 0;color:#66717b;font-size:10px;line-height:1.4}
.tp-plan-gate-close{width:38px;height:38px;flex:0 0 38px;display:grid;place-items:center;border:1px solid #d8dde2;border-radius:12px;background:#fff;color:#111;cursor:pointer}
.tp-plan-gate-current{display:inline-flex;align-items:center;gap:6px;margin-top:10px;padding:6px 9px;border-radius:999px;background:#f1f3f5;color:#20242a;font-size:8px;font-weight:850}
.tp-plan-gate-body{min-height:0;overflow-y:auto;padding:14px 18px 18px}
.tp-plan-gate-billing{display:flex;justify-content:center;margin-bottom:12px}
.tp-plan-gate-billing-inner{display:grid;grid-template-columns:1fr 1fr;padding:3px;border:1px solid #dfe4e8;border-radius:12px;background:#f4f6f7}
.tp-plan-gate-billing button{min-width:122px;min-height:34px;border:0;border-radius:9px;background:transparent;color:#68717a;font-size:9px;font-weight:850;cursor:pointer}
.tp-plan-gate-billing button.active{background:#16191d;color:#fff}
.tp-plan-gate-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.tp-plan-card{position:relative;min-width:0;padding:14px;border:1px solid #dfe4e8;border-radius:18px;background:#fff}
.tp-plan-card.is-current{background:#f7f8f9}
.tp-plan-card.is-target{border-color:#171a1e;box-shadow:inset 0 0 0 1px #171a1e}
.tp-plan-card.is-premium{background:linear-gradient(180deg,#fff,#f8f8f8)}
.tp-plan-card-badge{display:inline-flex;min-height:22px;align-items:center;padding:0 8px;border-radius:999px;background:#eceff1;color:#505a63;font-size:7px;font-weight:900;letter-spacing:.08em}
.tp-plan-card h3{margin:10px 0 0;font-size:18px;letter-spacing:-.035em}
.tp-plan-card-price{min-height:53px;margin-top:7px}
.tp-plan-card-price strong{display:block;font-size:17px}
.tp-plan-card-price span{display:block;margin-top:3px;color:#77818a;font-size:8px;line-height:1.35}
.tp-plan-card ul{display:grid;gap:7px;margin:12px 0 0;padding:0;list-style:none}
.tp-plan-card li{display:grid;grid-template-columns:16px minmax(0,1fr);gap:6px;align-items:flex-start;font-size:8.8px;line-height:1.35}
.tp-plan-card li svg{width:14px;height:14px;margin-top:-1px}
.tp-plan-card-action{width:100%;min-height:39px;margin-top:14px;border:1px solid #171a1e;border-radius:11px;background:#171a1e;color:#fff;font-size:9px;font-weight:900;cursor:pointer}
.tp-plan-card-action[disabled]{opacity:.52;cursor:default}
.tp-plan-gate-compare{margin-top:14px;overflow:hidden;border:1px solid #e1e5e8;border-radius:16px}
.tp-plan-gate-compare-row{display:grid;grid-template-columns:minmax(150px,1.4fr) repeat(3,minmax(92px,.8fr));border-top:1px solid #edf0f2}
.tp-plan-gate-compare-row:first-child{border-top:0;background:#f6f7f8;font-weight:900}
.tp-plan-gate-compare-row>*{min-width:0;padding:9px 10px;border-left:1px solid #edf0f2;font-size:8px;text-align:center}
.tp-plan-gate-compare-row>*:first-child{border-left:0;text-align:left}
.tp-plan-gate-compare-row strong{font-size:8.3px}
.tp-plan-gate-note{margin:12px 2px 0;color:#6a737c;font-size:8px;line-height:1.45;text-align:center}
.tp-plan-gate-message{margin:10px 0 0;padding:10px 11px;border-radius:12px;background:#f2f4f5;color:#2e353b;font-size:9px;line-height:1.4;text-align:center}
.tp-plan-gate-restore{display:flex;justify-content:center;margin-top:12px}
.tp-plan-gate-restore button{min-height:34px;display:inline-flex;align-items:center;gap:6px;padding:0 12px;border:1px solid #d7dde1;border-radius:10px;background:#fff;color:#30363c;font-size:8.5px;font-weight:850;cursor:pointer}
.tp-plan-gate-restore button[disabled]{opacity:.55;cursor:wait}
@media(max-width:780px){
  .tp-plan-gate{top:auto;bottom:8px;transform:translateX(-50%);width:calc(100% - 12px);max-height:92dvh;border-radius:23px}
  .tp-plan-gate-head{padding:15px 14px 12px}.tp-plan-gate-head h2{font-size:20px}.tp-plan-gate-body{padding:12px 11px 15px}
  .tp-plan-gate-cards{grid-template-columns:1fr}.tp-plan-card{padding:12px}.tp-plan-card ul{grid-template-columns:1fr 1fr;column-gap:10px}
  .tp-plan-gate-compare{overflow-x:auto}.tp-plan-gate-compare-row{min-width:590px}
}
`;

function cardFeatures(plan: 'free' | 'plus' | 'premium') {
  if (plan === 'free') {
    return [
      '1 aktif tarla',
      'Temel uydu ve Pusula',
      'Kuru Tarım',
      'Hava, gündem ve bilgi rehberi',
    ];
  }

  if (plan === 'plus') {
    return [
      '10 aktif tarla',
      'Gelişmiş uydu ve geçmiş',
      'Gelişmiş Pusula AI',
      'Sulama optimizasyonu',
      'Gelişmiş bildirimler ve raporlar',
      'Kuru Tarım',
    ];
  }

  return [
    'Sınırsız aktif tarla',
    'Plus’taki her şey',
    'PusulaPDF sınırsız',
    'Bahçe / ağaç zekâsı',
    'BİSİP / soğuklama',
    'Depo / mikotoksin riski',
    'Münavebe / ekim nöbeti',
    'Kuru Tarım',
  ];
}

function valueLabel(value: string | boolean) {
  if (value === true) return 'Var';
  if (value === false) return '—';
  return value;
}

export default function PlanUpgradeModal() {
  const entitlement = useEntitlementStore();
  const [request, setRequest] = useState<PlanUpgradeRequest | null>(null);
  const [yearly, setYearly] = useState(false);
  const [message, setMessage] = useState('');
  const [storePrices, setStorePrices] = useState<StorePlanPrice[]>([]);
  const [purchaseLoading, setPurchaseLoading] = useState<PaidPlan | null>(null);
  const [restoreLoading, setRestoreLoading] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const open = (event: Event) => {
      const detail = (event as CustomEvent<PlanUpgradeRequest>).detail;
      if (!detail?.requiredPlan) return;
      setRequest(detail);
      setMessage('');
    };

    const intercept = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const gated = target?.closest?.('[data-required-plan]') as HTMLElement | null;
      if (!gated) return;

      const required = gated.dataset.requiredPlan as PaidPlan | undefined;
      if (required !== 'plus' && required !== 'premium') return;
      if (planAllows(entitlement.effectivePlan, required)) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      setRequest({
        requiredPlan: required,
        feature: gated.dataset.planFeature || 'Bu özellik',
      });
      setMessage('');
    };

    window.addEventListener(PLAN_UPGRADE_EVENT, open as EventListener);
    document.addEventListener('click', intercept, true);

    return () => {
      window.removeEventListener(PLAN_UPGRADE_EVENT, open as EventListener);
      document.removeEventListener('click', intercept, true);
    };
  }, [entitlement.effectivePlan]);

  useEffect(() => {
    if (!request || !nativeStorePurchasesConfigured()) {
      setStorePrices([]);
      return;
    }

    let alive = true;

    void getNativeStorePrices()
      .then((prices) => {
        if (alive) setStorePrices(prices);
      })
      .catch((error) => {
        console.info('[RevenueCat] Mağaza fiyatları henüz alınamadı:', error);
        if (alive) setStorePrices([]);
      });

    return () => {
      alive = false;
    };
  }, [request]);

  const targetPlan = request?.requiredPlan ?? 'premium';
  const targetLabel = PLAN_LABELS[targetPlan];

  const cards = useMemo(
    () => (['free', 'plus', 'premium'] as const),
    [],
  );

  if (!request || typeof document === 'undefined') return null;

  const storePrice = (plan: PaidPlan) => {
    const row = storePrices.find((item) => item.plan === plan);

    if (!row) {
      return {
        price: planPriceLabel(plan, yearly),
        detail: yearly ? 'yıllık mağaza fiyatı' : 'aylık mağaza fiyatı',
      };
    }

    if (yearly) {
      return {
        price: row.annual || planPriceLabel(plan, true),
        detail: row.annualMonthlyEquivalent
          ? `yaklaşık ${row.annualMonthlyEquivalent} / ay`
          : 'yıllık mağaza fiyatı',
      };
    }

    return {
      price: row.monthly || planPriceLabel(plan, false),
      detail: 'aylık mağaza fiyatı',
    };
  };

  const selectPlan = async (plan: PaidPlan) => {
    if (planAllows(entitlement.effectivePlan, plan)) return;

    if (!nativeStorePurchasesSupported()) {
      window.dispatchEvent(
        new CustomEvent('tp:purchase-plan-requested', {
          detail: { plan, yearly, feature: request.feature ?? null },
        }),
      );
      setMessage(
        'App Store / Google Play aboneliği mobil uygulamada açılır. Web sürümünde mağaza satın alma ekranı gösterilmez.',
      );
      return;
    }

    if (!nativeStorePurchasesConfigured()) {
      setMessage(
        'Mağaza bağlantısının son anahtarı henüz girilmedi. RevenueCat public API anahtarı tanımlandığında bu düğme doğrudan App Store / Google Play ödeme ekranını açacak.',
      );
      return;
    }

    setPurchaseLoading(plan);
    setMessage('');

    try {
      const result = await purchaseStorePlan(
        plan,
        yearly ? 'annual' : 'monthly',
      );

      if (result.cancelled) {
        setMessage('Satın alma iptal edildi. Planın değişmedi.');
        return;
      }

      await refreshEntitlements().catch(() => undefined);

      setMessage(
        result.plan === 'premium'
          ? 'Premium aktif. Tüm Premium özelliklerin açıldı.'
          : result.plan === 'plus'
            ? 'Plus aktif. Plus özelliklerin açıldı.'
            : 'Satın alma mağazada tamamlandı; abonelik doğrulaması yenileniyor.',
      );
    } catch (error) {
      console.error('Mağaza satın alma hatası:', error);
      setMessage(
        error instanceof Error
          ? error.message
          : 'Satın alma tamamlanamadı.',
      );
    } finally {
      setPurchaseLoading(null);
    }
  };

  const manageSubscription = async () => {
    try {
      await manageNativeStoreSubscription();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Abonelik yönetimi açılamadı.',
      );
    }
  };

  const restore = async () => {
    if (!nativeStorePurchasesSupported()) {
      setMessage('Satın alımları geri yükleme mobil uygulamada kullanılabilir.');
      return;
    }

    if (!nativeStorePurchasesConfigured()) {
      setMessage('Mağaza bağlantısı henüz yapılandırılmadı.');
      return;
    }

    setRestoreLoading(true);
    setMessage('');

    try {
      const plan = await restoreStorePurchases();
      await refreshEntitlements().catch(() => undefined);

      setMessage(
        plan === 'premium'
          ? 'Premium satın alımın geri yüklendi.'
          : plan === 'plus'
            ? 'Plus satın alımın geri yüklendi.'
            : 'Bu mağaza hesabında aktif TarlaPusula aboneliği bulunamadı.',
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Satın alımlar geri yüklenemedi.',
      );
    } finally {
      setRestoreLoading(false);
    }
  };

  return createPortal(
    <>
      <style>{CSS}</style>
      <button
        type="button"
        className="tp-plan-gate-backdrop"
        aria-label="Plan karşılaştırmasını kapat"
        onClick={() => setRequest(null)}
      />
      <section className="tp-plan-gate" role="dialog" aria-modal="true" aria-label="TarlaPusula planları">
        <header className="tp-plan-gate-head">
          <div>
            <small>PLAN KARŞILAŞTIRMA</small>
            <h2>{request.feature || 'Bu özellik'} · {targetLabel}</h2>
            <p>
              Planları karşılaştır. Mobil uygulamada fiyatlar App Store / Google Play hesabından canlı alınır.
            </p>
            <span className="tp-plan-gate-current">
              <LockKeyhole size={12} />
              Mevcut plan · {PLAN_LABELS[entitlement.effectivePlan]}
            </span>
          </div>
          <button type="button" className="tp-plan-gate-close" onClick={() => setRequest(null)} aria-label="Kapat">
            <X size={19} />
          </button>
        </header>

        <div className="tp-plan-gate-body">
          <div className="tp-plan-gate-billing">
            <div className="tp-plan-gate-billing-inner">
              <button type="button" className={!yearly ? 'active' : ''} onClick={() => setYearly(false)}>Aylık</button>
              <button type="button" className={yearly ? 'active' : ''} onClick={() => setYearly(true)}>Yıllık · %20 avantaj</button>
            </div>
          </div>

          <div className="tp-plan-gate-cards">
            {cards.map((plan) => {
              const paid = plan !== 'free';
              const current = entitlement.effectivePlan === plan;
              const target = plan === targetPlan;
              const lowerThanCurrent =
                (plan === 'free' && entitlement.effectivePlan !== 'free') ||
                (plan === 'plus' && entitlement.effectivePlan === 'premium');
              const price = paid ? storePrice(plan) : null;

              return (
                <article
                  key={plan}
                  className={[
                    'tp-plan-card',
                    current ? 'is-current' : '',
                    target ? 'is-target' : '',
                    plan === 'premium' ? 'is-premium' : '',
                  ].filter(Boolean).join(' ')}
                >
                  <span className="tp-plan-card-badge">
                    {current ? 'MEVCUT PLAN' : target ? 'BU ÖZELLİK İÇİN' : plan === 'premium' ? 'TAM PAKET' : 'PLAN'}
                  </span>
                  <h3>{PLAN_LABELS[plan]}</h3>
                  <div className="tp-plan-card-price">
                    <strong>{paid ? price?.price : '0 TL'}</strong>
                    <span>{paid ? price?.detail : 'süresiz'}</span>
                  </div>

                  <ul>
                    {cardFeatures(plan).map((feature) => (
                      <li key={feature}><Check /> <span>{feature}</span></li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    className="tp-plan-card-action"
                    disabled={!paid || current || lowerThanCurrent || purchaseLoading !== null}
                    onClick={() => paid && void selectPlan(plan)}
                  >
                    {purchaseLoading === plan
                      ? 'Mağaza açılıyor…'
                      : current
                        ? 'Mevcut planın'
                        : !paid
                          ? 'Ücretsiz'
                          : lowerThanCurrent
                            ? 'Mevcut planın kapsamında'
                            : `${PLAN_LABELS[plan]} abone ol`}
                  </button>
                </article>
              );
            })}
          </div>

          <div className="tp-plan-gate-compare" aria-label="Plan özellik karşılaştırması">
            <div className="tp-plan-gate-compare-row">
              <strong>Özellik</strong>
              <strong>Ücretsiz</strong>
              <strong>Plus</strong>
              <strong>Premium</strong>
            </div>
            {PLAN_FEATURE_MATRIX.map((item) => (
              <div className="tp-plan-gate-compare-row" key={item.key}>
                <strong>{item.label}</strong>
                <span>{valueLabel(item.free)}</span>
                <span>{valueLabel(item.plus)}</span>
                <span>{valueLabel(item.premium)}</span>
              </div>
            ))}
          </div>

          <div className="tp-plan-gate-restore">
            <button type="button" disabled={restoreLoading || purchaseLoading !== null} onClick={() => void restore()}>
              <RotateCcw size={13} />
              {restoreLoading ? 'Kontrol ediliyor…' : 'Satın alımları geri yükle'}
            </button>
            {entitlement.effectivePlan !== 'free' && nativeStorePurchasesSupported() ? (
              <button type="button" disabled={restoreLoading || purchaseLoading !== null} onClick={() => void manageSubscription()}>
                Aboneliği yönet
              </button>
            ) : null}
          </div>

          {message ? <div className="tp-plan-gate-message">{message}</div> : null}
          <p className="tp-plan-gate-note">
            Abonelikler otomatik yenilenir ve mağaza hesabından yönetilir. Kuru Tarım tüm planlarda kullanılabilir. Kritik tarımsal risk uyarıları plan kilidi arkasına saklanmaz.
          </p>
        </div>
      </section>
    </>,
    document.body,
  );
}
