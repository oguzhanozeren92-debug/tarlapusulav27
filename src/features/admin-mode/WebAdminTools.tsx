import InAppAdminMode from './InAppAdminMode';

// Yönetim araçları yalnızca web panelinde açılır; App Store / Play Store
// derlemelerine hiç dahil edilmez (bkz. main.tsx).
export default function WebAdminTools() {
  return <InAppAdminMode />;
}
