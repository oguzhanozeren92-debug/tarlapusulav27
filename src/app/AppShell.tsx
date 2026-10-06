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

  const shellTitle =
    screen === 'pestGuideHub'
      ? 'Bilgi Rehberi'
      : screen === 'calendar'
        ? 'Takvim'
        : menuItems.find(
            (item) => String(item.screen) === String(screen),
          )?.label ?? null;

  return (
    <>
      <AppDrawer
        open={drawerOpen}
        activeScreen={screen}
        onClose={onCloseDrawer}
        onNavigate={onNavigate}
      />

      {showGlobalBand && screen !== 'home' && (
        <GlobalPusulaBand
          screen={String(screen)}
          title={shellTitle}
          fieldName={favoriteField?.name ?? fields[0]?.name ?? null}
          onBack={onBack}
          onMenu={onOpenDrawer}
          onOpenAi={onOpenAi}
        />
      )}

      {children}
    </>
  );
}
