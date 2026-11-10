import AdminUiRuntime from '../admin-ui/AdminUiRuntime';
import InAppAdminMode from './InAppAdminMode';

// Content and layout administration belongs to the authenticated web dashboard.
// Never mount these tools inside the App Store iOS/Android application.
export default function WebAdminTools() {
  return (
    <>
      <AdminUiRuntime />
      <InAppAdminMode />
    </>
  );
}
