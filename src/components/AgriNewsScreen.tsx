import type { Field, Screen } from '../types';
import PublishedAgriNewsBridge from '../features/content-public/PublishedAgriNewsBridge';
import ClassicBottomNav from './ClassicBottomNav';
import './AgriNewsScreen.css';

export interface AgriNewsScreenProps {
  fields: Field[];
  selectedFieldId?: string;
  screen?: Screen | string;
  sideMenuOpen?: boolean;
  setScreen?: (screen: Screen) => void;
  setSideMenuOpen?: (open: boolean) => void;
}

export default function AgriNewsScreen({ setScreen, screen }: AgriNewsScreenProps) {
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
      <main className="tp-agri-news-main tp-agri-news-main--live">
        <PublishedAgriNewsBridge onOpenSupport={openSupportCalculator} />
      </main>

      <ClassicBottomNav
        activeScreen={screen}
        setScreen={setScreen}
      />
    </div>
  );
}
