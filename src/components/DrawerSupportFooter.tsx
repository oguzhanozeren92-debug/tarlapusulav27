import { useState, type ReactNode } from 'react';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { useEntitlementStore } from '../entitlements/useEntitlementStore';
import IssueReportModal from './IssueReportModal';
import './DrawerSupportFooter.css';

type Props = { screen?: string };

const facebookUrl = String(import.meta.env.VITE_TARLAPUSULA_FACEBOOK_URL || '').trim();
const instagramUrl = String(import.meta.env.VITE_TARLAPUSULA_INSTAGRAM_URL || '').trim();
const supportEmail = String(import.meta.env.VITE_TARLAPUSULA_SUPPORT_EMAIL || '').trim();
const publicAppUrl = String(
  import.meta.env.VITE_PUBLIC_APP_URL ||
    import.meta.env.VITE_APP_URL ||
    'https://tarlapusulav27.vercel.app',
).trim().replace(/\/$/, '');
const privacyPolicyUrl = `${publicAppUrl}/privacy-policy.html`;

function SocialButton({
  label,
  href,
  children,
}: {
  label: string;
  href?: string;
  children: ReactNode;
}) {
  if (href) {
    return <a href={href} target="_blank" rel="noreferrer" aria-label={label} title={label}>{children}</a>;
  }
  return <button type="button" aria-label={label} title={`${label} · hesap açıldığında aktif olacak`}>{children}</button>;
}

export default function DrawerSupportFooter({ screen }: Props) {
  const [reportOpen, setReportOpen] = useState(false);
  const entitlement = useEntitlementStore();
  const showAdPrivacy =
    Capacitor.isNativePlatform() &&
    entitlement.effectivePlan === 'free';

  const openPrivacyPolicy = async () => {
    if (Capacitor.isNativePlatform()) {
      await Browser.open({ url: privacyPolicyUrl });
      return;
    }

    window.open(privacyPolicyUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <div className="tp-drawer-support-footer">
        <div className="tp-drawer-social-stack">
          <div className="tp-drawer-socials" aria-label="TarlaPusula iletişim">
            <SocialButton label="Facebook" href={facebookUrl || undefined}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 8h3V4.4c-.5-.1-2.2-.2-4.2-.2-4.1 0-6.8 2.5-6.8 7.1V15H2v4h4v9h5v-9h4.1l.7-4H11v-3.3C11 9.5 11.6 8 14 8Z"/></svg>
            </SocialButton>
            <SocialButton label="Instagram" href={instagramUrl || undefined}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/></svg>
            </SocialButton>
            <SocialButton label="Kurumsal e-posta" href={supportEmail ? `mailto:${supportEmail}` : undefined}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>
            </SocialButton>
          </div>
          <button
            className="tp-drawer-privacy-link"
            type="button"
            onClick={() => {
              void openPrivacyPolicy();
            }}
          >
            Gizlilik Politikası
          </button>
        </div>

        {showAdPrivacy ? (
          <button
            className="tp-drawer-report-button"
            type="button"
            onClick={() => {
              window.dispatchEvent(new CustomEvent('tp:ad-privacy-options'));
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3 5 6v5c0 4.6 2.7 8 7 10 4.3-2 7-5.4 7-10V6l-7-3Z"/>
              <path d="M9.5 12.2 11.2 14l3.6-4"/>
            </svg>
            <span>Reklam gizlilik tercihleri</span>
          </button>
        ) : null}

        <button className="tp-drawer-report-button" type="button" onClick={() => setReportOpen(true)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8v5"/><circle cx="12" cy="16.5" r=".8"/><path d="M10.3 4.2 2.8 17.1A2 2 0 0 0 4.5 20h15a2 2 0 0 0 1.7-2.9L13.7 4.2a2 2 0 0 0-3.4 0Z"/></svg>
          <span>Hata Bildir</span>
        </button>
      </div>

      <IssueReportModal open={reportOpen} onClose={() => setReportOpen(false)} screen={screen} />
    </>
  );
}
