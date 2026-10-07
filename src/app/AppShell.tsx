import type { ReactNode } from 'react';
import AppDrawer from '../components/AppDrawer';
import GlobalPusulaBand from '../components/GlobalPusulaBand';
import type { Field, Screen } from '../types';

export type AppMenuItem = {
  screen: Screen;
  icon: string;
  label: string;
  badge?: string;
};

type AppShellProps = {
  children: ReactNode;
  screen: Screen;
  drawerOpen: boolean;
  menuItems: AppMenuItem[];
  fields: Field[];
  favoriteFieldId: string;
  showGlobalBand?: boolean;
  onCloseDrawer: () => void;
  onOpenDrawer: () => void;
  onNavigate: (screen: Screen, label: string) => void;
  onBack: () => void;
  onOpenAi: () => void;
};

/**
 * TarlaPusula application chrome.
 *
 * Phase 0.2 deliberately keeps the existing AppDrawer and GlobalPusulaBand
 * implementations untouched. The purpose of this component is to move shell
 * wiring out of App.tsx before either visual component is migrated to the new
 * UI system.
 */
export default function AppShell({
  children,
  screen,
  drawerOpen,
  menuItems,
  fields,
  favoriteFieldId,
  showGlobalBand = true,
  onCloseDrawer,
  onOpenDrawer,
  onNavigate,
  onBack,
  onOpenAi,
}: AppShellProps) {
  const favoriteField = fields.find(
    (field) => String(field.id) === String(favoriteFieldId),
  );

  const canonicalTitles: Partial<Record<Screen, string>> = {
    weatherHub: 'Hava Durumu',
    inventoryHub: 'Depom',
    marketHub: 'Piyasa Fiyatları',
    pestGuideHub: 'Bilgi Rehberi',
    calendar: 'Takvim',
    notificationsHub: 'Bildirimler',
    settingsHub: 'Ayarlar',
    supportHub: 'Tarımsal Destek',
    agendaHub: 'Tarım Gündemi',
    nutritionHub: 'Bitki Besleme',
    producerMarketHub: 'Üretici Pazarı',
    fieldNotebookHub: 'Tarla Defteri',
    aiAnalysis: 'Pusula AI',
    fieldControlHub: 'Tarla Kontrol',
  };

  const shellTitle =
    canonicalTitles[screen] ??
    menuItems.find(
      (item) => String(item.screen) === String(screen),
    )?.label ??
    null;

  const globalBandVisible = showGlobalBand && screen !== 'home';

  return (
    <>
      <AppDrawer
        open={drawerOpen}
        activeScreen={screen}
        onClose={onCloseDrawer}
        onNavigate={onNavigate}
      />

      {globalBandVisible && (
        <GlobalPusulaBand
          screen={String(screen)}
          title={shellTitle}
          fieldName={favoriteField?.name ?? fields[0]?.name ?? null}
          onBack={onBack}
          onMenu={onOpenDrawer}
          onOpenAi={onOpenAi}
        />
      )}

      {globalBandVisible ? (
        <div className="tp-app-shell-content tp-app-shell-content--with-global-band">
          {children}
        </div>
      ) : (
        children
      )}
    </>
  );
}
