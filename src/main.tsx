import { StrictMode, Suspense, lazy } from 'react';
import { Capacitor } from '@capacitor/core';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import AccountDeletionPage from './pages/AccountDeletion/AccountDeletionPage';
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
import './styles/FieldSelectChevron.css';
import './styles/MobileViewportFit.css';
import './styles/AppleReviewTablet.css';
import PusulaPointsCelebration from './gamification/PusulaPointsCelebration';
import PusulaPdfReadyBridge from './features/pusula-pdf/PusulaPdfReadyBridge';
import { installNativeFeedback } from './mobile/nativeFeedback';
import { installNativeAdsBridge } from './mobile/nativeAds';
import NativePushBridge from './mobile/NativePushBridge';
import NativeAuthBridge from './mobile/NativeAuthBridge';
import NativeShellBridge from './mobile/NativeShellBridge';
import { forwardWebOAuthCallbackToNative } from './mobile/nativeAuth';

// App Store distributions contain no remote UI manipulation or in-app admin panel.
// Web-only administrators retain content management in the browser dashboard.
const WebAdminTools = import.meta.env.VITE_APP_STORE_RELEASE === 'true'
  ? null
  : lazy(() => import('./features/admin-mode/WebAdminTools'));

forwardWebOAuthCallbackToNative();

const nativePlatform = Capacitor.getPlatform();
if (Capacitor.isNativePlatform()) {
  document.documentElement.classList.add('tp-native-app', `tp-native-${nativePlatform}`);
  document.body?.classList.add('tp-native-app');
  installNativeFeedback();
  installNativeAdsBridge();
}

if (window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/')) {
  try {
    window.localStorage.setItem('tp_admin_mode_open_v1', '1');
  } catch {
    // Admin yetkisi yine Supabase + admin_users ile doğrulanır.
  }
}

const accountDeletionMode =
  !Capacitor.isNativePlatform() &&
  (
    window.location.pathname === '/account-deletion' ||
    new URLSearchParams(window.location.search).get('accountDeletion') === '1'
  );

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {accountDeletionMode ? (
      <AccountDeletionPage />
    ) : (
      <>
        <App />
        <PremiumFeedbackLayer />
        <HomeMapLayerLoadingBridge />
        <AppNotificationBridge />
        <AppActivityTracker />
        <NativePushBridge />
        <PusulaPdfReadyBridge />
        <NativeAuthBridge />
        <NativeShellBridge />
        {WebAdminTools && !Capacitor.isNativePlatform() && (
          <Suspense fallback={null}>
            <WebAdminTools />
          </Suspense>
        )}
        <PusulaPointsCelebration />
      </>
    )}
  </StrictMode>,
);
