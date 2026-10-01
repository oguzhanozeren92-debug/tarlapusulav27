import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import AdminUiRuntime from './features/admin-ui/AdminUiRuntime';
import InAppAdminMode from './features/admin-mode/InAppAdminMode';
import AppNotificationBridge from './features/admin-mode/AppNotificationBridge';
import HomeMapLayerLoadingBridge from './features/home-map/components/HomeMapLayerLoadingBridge';
import './styles/TarlaPusulaTheme.css';
import './styles/MobileAppShell.css';
import './styles/WhiteAppTheme.css';
import './styles/MonochromeUI.css';
import './styles/MapReadabilityFix.css';
import './styles/HomeFieldsSheetWhiteAccent.css';

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
      <HomeMapLayerLoadingBridge />
      <AdminUiRuntime />
      <AppNotificationBridge />
      <InAppAdminMode />
    </>
  </StrictMode>,
);
