import { ArrowLeft, Menu } from 'lucide-react';
import type { Field, Screen } from '../types';
import PublishedAgriNewsBridge from '../features/content-public/PublishedAgriNewsBridge';
import './AgriNewsScreen.css';

export interface AgriNewsScreenProps {
  fields: Field[];
  selectedFieldId?: string;
  screen?: Screen | string;
  sideMenuOpen?: boolean;
  setScreen?: (screen: Screen) => void;
  setSideMenuOpen?: (open: boolean) => void;
}

export default function AgriNewsScreen({ setScreen, setSideMenuOpen }: AgriNewsScreenProps) {
  const openSupportCalculator = () => {
    try {
      window.sessionStorage.setItem('tp-open-support-calculator', '1');
    } catch {
      // sessionStorage kapalıysa supportHub varsayılan olarak hesaplayıcıyı açar.
    }
    setScreen?.('supportHub');
  };

  return (
    <div className="tp-agri-news-page tp-agri-news-live-v3">
      <header className="tp-agri-news-topbar">
        <button type="button" onClick={() => setScreen?.('home')} aria-label="Ana sayfaya dön">
          <ArrowLeft size={18} />
        </button>
        <div>
          <strong>Tarım Gündemi</strong>
          <small>Türkiye · Dünya · Üretici Makaleleri · Destek</small>
        </div>
        <button type="button" onClick={() => setSideMenuOpen?.(true)} aria-label="Menüyü aç">
          <Menu size={18} />
        </button>
      </header>

      <main className="tp-agri-news-main tp-agri-news-main--live">
        <section className="tp-agri-news-heading tp-agri-news-heading--live">
          <div>
            <span>TARIMSAL GÜNDEM</span>
            <h1>Tarım Gündemi</h1>
            <p>Üreticiye fayda sağlayan içerikler admin onayından sonra kaynak, tarih ve konum bilgileriyle yayınlanır.</p>
          </div>
        </section>
        <PublishedAgriNewsBridge onOpenSupport={openSupportCalculator} />
      </main>
    </div>
  );
}
