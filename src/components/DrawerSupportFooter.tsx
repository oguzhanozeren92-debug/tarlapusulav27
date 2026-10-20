import { useState, type MouseEvent, type ReactNode } from 'react';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import IssueReportModal from './IssueReportModal';
import './DrawerSupportFooter.css';

type Props = { screen?: string; onCloseDrawer?: () => void };

const facebookUrl = String(import.meta.env.VITE_TARLAPUSULA_FACEBOOK_URL || 'https://www.facebook.com/tarlapusula').trim();
const instagramUrl = String(import.meta.env.VITE_TARLAPUSULA_INSTAGRAM_URL || 'https://www.instagram.com/tarlapusula/').trim();
const supportEmail = String(import.meta.env.VITE_TARLAPUSULA_SUPPORT_EMAIL || 'tarlapusula@gmail.com').trim();
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
  href: string;
  children: ReactNode;
}) {
  const isEmail = href.startsWith('mailto:');

  const handleOpen = (event: MouseEvent<HTMLAnchorElement>) => {
    // Mailto varsayılan e-posta uygulamasına devredilir.
    // iOS/Android WebView'larında target="_blank" sosyal bağlantıları
    // sessizce engelleyebilir; Capacitor Browser ile güvenilir biçimde aç.
    if (isEmail || !Capacitor.isNativePlatform()) return;
    event.preventDefault();
    void Browser.open({ url: href }).catch((error) => {
      console.warn('[TarlaPusula] Sosyal medya bağlantısı açılamadı:', error);
      window.location.assign(href);
    });
  };

  return (
    <a
      href={href}
      target={isEmail ? undefined : '_blank'}
      rel={isEmail ? undefined : 'noopener noreferrer'}
      aria-label={label}
      title={label}
      onClick={handleOpen}
    >
      {children}
    </a>
  );
}

export default function DrawerSupportFooter({ screen }: Props) {
  const [reportOpen, setReportOpen] = useState(false);
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
        <div className="tp-drawer-membership tp-drawer-membership--free" aria-label="TarlaPusula tamamen ücretsiz">
          <div className="tp-drawer-membership-title">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9"/>
              <path d="m7 12 3.5 3.5L17 9"/>
            </svg>
            <span>TARLAPUSULA</span>
          </div>
          <strong className="tp-drawer-membership-plan">Ücretsiz Kullanım</strong>
          <span className="tp-drawer-membership-confirmed">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4 10-10"/></svg>
            Tüm özellikler açık
          </span>
        </div>

        <div className="tp-drawer-social-stack">
          <div className="tp-drawer-socials" aria-label="TarlaPusula iletişim">
            <SocialButton label="Facebook" href={facebookUrl}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 8h3V4.4c-.5-.1-2.2-.2-4.2-.2-4.1 0-6.8 2.5-6.8 7.1V15H2v4h4v9h5v-9h4.1l.7-4H11v-3.3C11 9.5 11.6 8 14 8Z"/></svg>
            </SocialButton>
            <SocialButton label="Instagram" href={instagramUrl}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/></svg>
            </SocialButton>
            <SocialButton label="Kurumsal e-posta" href={`mailto:${supportEmail}`}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>
            </SocialButton>
          </div>
          <div className="tp-drawer-footer-links">
            <button
              className="tp-drawer-privacy-link"
              type="button"
              onClick={() => {
                void openPrivacyPolicy();
              }}
            >
              Gizlilik Politikası
            </button>

            <button
              className="tp-drawer-privacy-link tp-drawer-privacy-link--report"
              type="button"
              onClick={() => setReportOpen(true)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 8v5"/>
                <circle cx="12" cy="16.5" r=".8"/>
                <path d="M10.3 4.2 2.8 17.1A2 2 0 0 0 4.5 20h15a2 2 0 0 0 1.7-2.9L13.7 4.2a2 2 0 0 0-3.4 0Z"/>
              </svg>
              <span>Hata Bildir</span>
            </button>
          </div>
        </div>
      </div>

      <IssueReportModal open={reportOpen} onClose={() => setReportOpen(false)} screen={screen} />
    </>
  );
}
