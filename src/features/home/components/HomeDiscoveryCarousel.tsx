import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, BookOpen, CalendarClock, CloudSun,
  Droplets, FileText, Leaf, Map, Newspaper, ScanSearch,
  ShieldCheck, Sprout, Tractor, TrendingUp, X,
  type LucideIcon,
} from 'lucide-react';
import { openPlanUpgrade } from '../../../entitlements/planAccess';
import { planAllows, type PaidPlan } from '../../../entitlements/planCatalog';
import { useEntitlementStore } from '../../../entitlements/useEntitlementStore';
import './HomeDiscoveryCarousel.css';

export type HomeDiscoveryFeatureId =
  | 'satellite' | 'irrigation' | 'ai' | 'spray' | 'workability'
  | 'soil' | 'frost' | 'health' | 'pdf' | 'agenda' | 'market' | 'guide';

type DiscoveryFeature = {
  id: HomeDiscoveryFeatureId;
  title: string;
  description: string;
  action: string;
  image: string;
  icon: LucideIcon;
  plan?: PaidPlan;
};

// Fotoğraflar görsel arka plandır; bütün metinler, etiketler ve butonlar gerçek HTML'dir.
// Kaynak görseller Unsplash CDN'inden optimize edilmiş boyutta alınır. Ağ hatasında
// CSS'teki nötr görsel zemin korunur; karusel/kısayollar çalışmaya devam eder.
const photo = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=78`;

const FEATURES: DiscoveryFeature[] = [
  {
    id: 'satellite', title: 'Tarlanı Uyduyla Takip Et',
    description: 'Bitki gelişimini ve geçmiş uydu görüntülerindeki değişimi harita üzerinden incele.',
    action: 'Uydu Haritasını Aç', icon: Map,
    image: photo('photo-1500937386664-56d1dfef3854'),
  },
  {
    id: 'irrigation', title: 'Sulama Zamanını Planla',
    description: 'Tarlanın su ihtiyacını değerlendir, sulama kararını ve programını tek ekranda gör.',
    action: 'Sulamayı Gör', icon: Droplets,
    image: photo('photo-1523348837708-15d4a09cfac2'),
  },
  {
    id: 'ai', title: 'Pusula AI ile Sorunu İncele',
    description: 'Bitki fotoğrafını gönder; olası hastalık, zararlı ve stres belirtilerini değerlendir.',
    action: 'Pusula AI’ı Aç', icon: ScanSearch,
    image: photo('photo-1464226184884-fa280b87c399'),
  },
  {
    id: 'spray', title: 'İlaçlama Zamanını Takip Et',
    description: 'Saatlik rüzgâr, yağış ve hava koşullarından ilaçlama için uygun zaman aralığını incele.',
    action: 'İlaçlama Saatlerine Bak', icon: CalendarClock, plan: 'plus',
    image: photo('photo-1625246333195-78d9c38ad449'),
  },
  {
    id: 'workability', title: 'Tarlaya Girilebilirliğine Bak',
    description: 'Yağış ve zemin koşullarına göre traktörle çalışmaya uygunluk değerlendirmesini gör.',
    action: 'Girilebilirliği Gör', icon: Tractor, plan: 'plus',
    image: photo('photo-1592982537447-7440770cbfc9'),
  },
  {
    id: 'soil', title: 'Tahmini Toprak Profilini Gör',
    description: 'SoilGrids modelindeki tahmini toprak yapısını ve katman bilgilerini incele.',
    action: 'Toprak Profilini Aç', icon: Sprout, plan: 'plus',
    image: photo('photo-1518977676601-b53f82aba655'),
  },
  {
    id: 'frost', title: 'Don Riskini Önceden Gör',
    description: 'Sıcaklık tahminlerini ve olası don uyarılarını takip ederek önlem zamanını planla.',
    action: 'Hava Risklerini Gör', icon: CloudSun, plan: 'plus',
    image: photo('photo-1470252649378-9c29740c9fa8'),
  },
  {
    id: 'health', title: 'Tarla Sağlığını Değerlendir',
    description: 'Tarlanın durumunu, dikkat isteyen noktaları ve mevcut sağlık özetlerini birlikte gör.',
    action: 'Tarla Durumunu Aç', icon: ShieldCheck, plan: 'plus',
    image: photo('photo-1500382017468-9049fed747ef'),
  },
  {
    id: 'pdf', title: 'PusulaPDF Raporlarını Aç',
    description: 'Hazırlanan tarla raporlarını bildirimlerinden aç, kaydet ve paylaş.',
    action: 'Raporlarıma Git', icon: FileText, plan: 'premium',
    image: photo('photo-1495107334309-fcf20504a5ab'),
  },
  {
    id: 'agenda', title: 'Gündemi Takip Et',
    description: 'Türkiye ve dünyadan tarım haberlerini, yeni gelişmeleri ve duyuruları takip et.',
    action: 'Gündemi Aç', icon: Newspaper,
    image: photo('photo-1500382017468-9049fed747ef'),
  },
  {
    id: 'market', title: 'Piyasa Fiyatlarını İncele',
    description: 'Ürün fiyatlarını tek yerden karşılaştır, tarım piyasasındaki gelişmeleri izle.',
    action: 'Fiyatları Gör', icon: TrendingUp,
    image: photo('photo-1501436513145-30f24e19fcc4'),
  },
  {
    id: 'guide', title: 'Bilgi Rehberinde Ara',
    description: 'Tarımsal konularda kısa ve anlaşılır bilgi kartlarına hızlıca ulaş.',
    action: 'Bilgi Rehberini Aç', icon: BookOpen,
    image: photo('photo-1456513080510-7bf3a84b82f8'),
  },
];

type Props = { onOpenFeature: (featureId: HomeDiscoveryFeatureId) => void };

export default function HomeDiscoveryCarousel({ onOpenFeature }: Props) {
  const { effectivePlan } = useEntitlementStore();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [preview, setPreview] = useState<DiscoveryFeature | null>(null);
  const touchStartX = useRef<number | null>(null);
  const count = FEATURES.length;
  const active = FEATURES[index];

  useEffect(() => {
    if (paused || preview || typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') setIndex((current) => (current + 1) % count);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [paused, preview, count]);

  useEffect(() => {
    if (!preview) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreview(null);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [preview]);

  const go = (next: number) => setIndex((next + count) % count);
  const open = (feature: DiscoveryFeature) => {
    if (feature.plan && !planAllows(effectivePlan, feature.plan)) {
      setPreview(feature);
      return;
    }
    onOpenFeature(feature.id);
  };

  return (
    <section className="tp-discovery" aria-label="TarlaPusula özelliklerini keşfet">
      <div className="tp-discovery__heading">
        <div>
          <span>TarlaPusula’yı Keşfet</span>
          <h2>Tarlan İçin Neler Yapabilirsin?</h2>
        </div>
        <span className="tp-discovery__counter" aria-live="polite">
          {String(index + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
        </span>
      </div>

      <div
        className="tp-discovery__viewport"
        role="region"
        aria-roledescription="karusel"
        aria-label="TarlaPusula özellik kartları"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setPaused(false);
        }}
        onTouchStart={(event) => { touchStartX.current = event.touches[0]?.clientX ?? null; }}
        onTouchEnd={(event) => {
          if (touchStartX.current === null) return;
          const delta = (event.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
          touchStartX.current = null;
          if (Math.abs(delta) > 42) go(index + (delta < 0 ? 1 : -1));
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
            event.preventDefault();
            go(index + (event.key === 'ArrowRight' ? 1 : -1));
          }
        }}
        tabIndex={0}
      >
        <div className="tp-discovery__track" style={{ transform: `translateX(-${index * 100}%)` }}>
          {FEATURES.map((item, position) => {
            const Icon = item.icon;
            const accessible = !item.plan || planAllows(effectivePlan, item.plan);
            return (
              <article
                key={item.id}
                className="tp-discovery__slide"
                aria-roledescription="slayt"
                aria-label={`${position + 1} / ${count}: ${item.title}`}
                inert={index !== position}
              >
                <img className="tp-discovery__image" src={item.image} alt="" loading={position <= 1 ? 'eager' : 'lazy'} decoding="async"
                  onError={(event) => { event.currentTarget.style.opacity = '0'; }} />
                <div className="tp-discovery__gradient" aria-hidden="true" />
                <div className="tp-discovery__copy">
                  <span className="tp-discovery__icon" aria-hidden="true"><Icon size={23} strokeWidth={1.85} /></span>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                  <button type="button" className="tp-discovery__cta" onClick={() => open(item)}>
                    <span>{accessible ? item.action : 'Özelliği Keşfet'}</span>
                    <ArrowRight size={18} aria-hidden="true" />
                  </button>
                </div>
                {item.plan && (
                  <span className="tp-discovery__premium"><Leaf size={13} aria-hidden="true" /> Premium</span>
                )}
              </article>
            );
          })}
        </div>
      </div>

      <div className="tp-discovery__controls">
        <button type="button" className="tp-discovery__arrow" onClick={() => go(index - 1)} aria-label="Önceki özellik">
          <ArrowLeft size={17} />
        </button>
        <div className="tp-discovery__dots" aria-label="Kart seçimi">
          {FEATURES.map((item, position) => (
            <button key={item.id} type="button" onClick={() => go(position)}
              aria-label={`${position + 1}. kart: ${item.title}`}
              aria-current={index === position ? 'true' : undefined}
              className={index === position ? 'active' : ''} />
          ))}
        </div>
        <button type="button" className="tp-discovery__arrow" onClick={() => go(index + 1)} aria-label="Sonraki özellik">
          <ArrowRight size={17} />
        </button>
      </div>

      {preview && (
        <div className="tp-discovery__modal-backdrop" onClick={() => setPreview(null)}>
          <div className="tp-discovery__modal" role="dialog" aria-modal="true" aria-label={preview.title}
            onClick={(event) => event.stopPropagation()}>
            <button className="tp-discovery__modal-close" aria-label="Kapat" type="button" onClick={() => setPreview(null)}>
              <X size={19} />
            </button>
            <div className="tp-discovery__modal-label">Premium özellik</div>
            <h3>{preview.title}</h3>
            <p>{preview.description}</p>
            <p className="tp-discovery__modal-note">
              {preview.plan === 'premium'
                ? 'Bu özellik Premium planına özeldir.'
                : 'Bu gelişmiş özellik ücretli planlarda kullanılabilir.'}
            </p>
            <button type="button" className="tp-discovery__modal-upgrade" onClick={() => {
              const target = preview;
              setPreview(null);
              openPlanUpgrade({ requiredPlan: target.plan ?? 'premium', feature: target.title });
            }}>Planları İncele <ArrowRight size={17} /></button>
          </div>
        </div>
      )}
    </section>
  );
}
