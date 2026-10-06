import { StrictMode } from 'react';
import { Capacitor } from '@capacitor/core';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import AdminUiRuntime from './features/admin-ui/AdminUiRuntime';
import InAppAdminMode from './features/admin-mode/InAppAdminMode';
import AppNotificationBridge from './features/admin-mode/AppNotificationBridge';
import AppActivityTracker from './features/notifications/components/AppActivityTracker';
import HomeMapLayerLoadingBridge from './features/home-map/components/HomeMapLayerLoadingBridge';
import PremiumFeedbackLayer from './features/premium-feedback/PremiumFeedbackLayer';
import './styles/TarlaPusulaTheme.css';
import './styles/MobileAppShell.css';
import './styles/WhiteAppTheme.css';
import './styles/MonochromeUI.css';
import './styles/MapReadabilityFix.css';
import './styles/HomeFieldsSheetWhiteAccent.css';
import PusulaPointsCelebration from './gamification/PusulaPointsCelebration';
import PlanUpgradeModal from './entitlements/PlanUpgradeModal';
import { installNativeFeedback } from './mobile/nativeFeedback';
import NativePushBridge from './mobile/NativePushBridge';

const nativePlatform = Capacitor.getPlatform();
if (Capacitor.isNativePlatform()) {
  document.documentElement.classList.add('tp-native-app', `tp-native-${nativePlatform}`);
  document.body?.classList.add('tp-native-app');
  installNativeFeedback();
}

if (window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/')) {
  try {
    window.localStorage.setItem('tp_admin_mode_open_v1', '1');
  } catch {
    // Admin yetkisi yine Supabase + admin_users ile doğrulanır.
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <>
      <App />
      <PremiumFeedbackLayer />
      <HomeMapLayerLoadingBridge />
      <AdminUiRuntime />
      <AppNotificationBridge />
      <AppActivityTracker />
      <NativePushBridge />
      <InAppAdminMode />
      <PusulaPointsCelebration />
      <PlanUpgradeModal />
    </>
  </StrictMode>,
);
