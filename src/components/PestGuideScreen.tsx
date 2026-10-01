import KnowledgeLibrary from '../features/knowledge/components/KnowledgeLibrary';
import type { Field, Screen } from '../types';
import ClassicBottomNav from './ClassicBottomNav';
import '../pages/Home/HomeScreen.css';
import './PestGuideScreen.css';

export interface PestGuideScreenProps {
  fields: Field[];
  selectedFieldId?: string;
  screen?: Screen | string;
  desktopMenuItems?: Array<{
    screen: Screen | string;
    icon?: string;
    label: string;
    badge?: string;
  }>;
  sideMenuOpen?: boolean;
  setScreen?: (screen: Screen) => void;
  setSideMenuOpen?: (open: boolean) => void;
}

/**
 * Bilgi Rehberi temiz başlangıç yüzeyi.
 * Üst navigasyon ve drawer App.tsx içindeki ortak TarlaPusula kabuğundan gelir.
 * Alt navigasyon HomeScreen ile aynı sınıfları, ikonları ve sıralamayı kullanır.
 */
export default function PestGuideScreen({ fields, setScreen }: PestGuideScreenProps) {
  return (
    <div className="tp-knowledge-page">
      <main className="tp-knowledge-canvas" aria-label="Bilgi Rehberi">
        <KnowledgeLibrary fieldCrops={fields.map((field) => field.crop).filter(Boolean)} />
      </main>

      <ClassicBottomNav setScreen={setScreen} />
    </div>
  );
}
