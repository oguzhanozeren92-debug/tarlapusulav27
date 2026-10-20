import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, BookOpen, CalendarClock, CloudSun,
  Droplets, FileText, Map, Newspaper, ScanSearch,
  ShieldCheck, Sprout, Tractor, TrendingUp,
  type LucideIcon,
} from 'lucide-react';
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
};

// Her konuya ait fotoğraf proje içinde tutulur ve mobil pakete dahildir.
// Dış görsel servisleri / CDN erişimi gerektirmez.
const photo = (id: HomeDiscoveryFeatureId) => `/feature-discovery/${id}.jpg`;

const FEATURES: DiscoveryFeature[] = [
  {
    id: 'satellite', title: 'Tarlanı Uyduyla Takip Et',
    description: 'Bitki gelişimini ve geçmiş uydu görüntülerindeki değişimi harita üzerinden incele.',
    action: 'Uydu Haritasını Aç', icon: Map,
    image: photo('satellite'),
  },
  {
    id: 'irrigation', title: 'Sulama Zamanını Planla',
    description: 'Tarlanın su ihtiyacını değerlendir, sulama kararını ve programını tek ekranda gör.',
    action: 'Sulamayı Gör', icon: Droplets,
    image: photo('irrigation'),
  },
  {
    id: 'ai', title: 'Pusula AI ile Sorunu İncele',
    description: 'Bitki fotoğrafını gönder; olası hastalık, zararlı ve stres belirtilerini değerlendir.',
    action: 'Pusula AI’ı Aç', icon: ScanSearch,
    image: photo('ai'),
  },
  {
    id: 'spray', title: 'İlaçlama Zamanını Takip Et',
    description: 'Saatlik rüzgâr, yağış ve hava koşullarından ilaçlama için uygun zaman aralığını incele.',
    action: 'İlaçlama Saatlerine Bak', icon: CalendarClock,
    image: photo('spray'),
  },
  {
    id: 'workability', title: 'Tarlaya Girilebilirliğine Bak',
    description: 'Yağış ve zemin koşullarına göre traktörle çalışmaya uygunluk değerlendirmesini gör.',
    action: 'Girilebilirliği Gör', icon: Tractor,
    image: photo('workability'),
  },
  {
    id: 'soil', title: 'Tahmini Toprak Profilini Gör',
    description: 'SoilGrids modelindeki tahmini toprak yapısını ve katman bilgilerini incele.',
    action: 'Toprak Profilini Aç', icon: Sprout,
    image: photo('soil'),
  },
  {
    id: 'frost', title: 'Don Riskini Önceden Gör',
    description: 'Sıcaklık tahminlerini ve olası don uyarılarını takip ederek önlem zamanını planla.',
    action: 'Hava Risklerini Gör', icon: CloudSun,
    image: photo('frost'),
  },
  {
    id: 'health', title: 'Tarla Sağlığını Değerlendir',
    description: 'Tarlanın durumunu, dikkat isteyen noktaları ve mevcut sağlık özetlerini birlikte gör.',
    action: 'Tarla Durumunu Aç', icon: ShieldCheck,
    image: photo('health'),
  },
  {
    id: 'pdf', title: 'PusulaPDF Raporlarını Aç',
    description: 'Hazırlanan tarla raporlarını bildirimlerinden aç, kaydet ve paylaş.',
    action: 'Raporlarıma Git', icon: FileText,
    image: photo('pdf'),
  },
  {
    id: 'agenda', title: 'Gündemi Takip Et',
    description: 'Türkiye ve dünyadan tarım haberlerini, yeni gelişmeleri ve duyuruları takip et.',
    action: 'Gündemi Aç', icon: Newspaper,
    image: photo('agenda'),
  },
  {
    id: 'market', title: 'Piyasa Fiyatlarını İncele',
    description: 'Ürün fiyatlarını tek yerden karşılaştır, tarım piyasasındaki gelişmeleri izle.',
    action: 'Fiyatları Gör', icon: TrendingUp,
    image: photo('market'),
  },
  {
    id: 'guide', title: 'Bilgi Rehberinde Ara',
    description: 'Tarımsal konularda kısa ve anlaşılır bilgi kartlarına hızlıca ulaş.',
    action: 'Bilgi Rehberini Aç', icon: BookOpen,
    image: photo('guide'),
  },
];

type Props = { onOpenFeature: (featureId: HomeDiscoveryFeatureId) => void };

export default function HomeDiscoveryCarousel({ onOpenFeature }: Props) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const count = FEATURES.length;
  const active = FEATURES[index];

  useEffect(() => {
    if (paused || typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') setIndex((current) => (current + 1) % count);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [paused, count]);

  const go = (next: number) => setIndex((next + count) % count);
  const open = (feature: DiscoveryFeature) => onOpenFeature(feature.id);

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
            return (
              <article
                key={item.id}
                className="tp-discovery__slide"
                aria-roledescription="slayt"
                aria-label={`${position + 1} / ${count}: ${item.title}`}
                inert={index !== position}
              >
                <img className="tp-discovery__image" src={item.image} alt="" loading={position <= 1 ? 'eager' : 'lazy'} decoding="async"
                  onError={(event) => { event.currentTarget.classList.add('tp-discovery__image--unavailable'); }} />
                <div className="tp-discovery__gradient" aria-hidden="true" />
                <div className="tp-discovery__copy">
                  <span className="tp-discovery__icon" aria-hidden="true"><Icon size={23} strokeWidth={1.85} /></span>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                  <button type="button" className="tp-discovery__cta" onClick={() => open(item)}>
                    <span>{item.action}</span>
                    <ArrowRight size={18} aria-hidden="true" />
                  </button>
                </div>
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


    </section>
  );
}
