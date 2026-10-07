import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Screen } from '../types';
import { supabase } from '../supabaseClient';
import { useGamificationStore } from '../gamification/useGamificationStore';
import DrawerSupportFooter from './DrawerSupportFooter';
import PusulaPointsModal from './PusulaPointsModal';
import drawerFieldBg from '../assets/login-bg.webp';

type AppDrawerProps = {
  open: boolean;
  activeScreen?: Screen;
  onClose: () => void;
  onNavigate: (screen: Screen, label: string) => void;
  profileName?: string | null;
  points?: number | null;
};

const PUSULA_BODY_SRC =
  'https://xwyfidtktauxivsosmex.supabase.co/storage/v1/object/public/pusula/compass-body.webp';

const DRAWER_BG_SRC =
  'https://fkrqvwarxzmdrexsxtzw.supabase.co/storage/v1/object/public/ui-icons/backgrounds/d70787c4-3c37-4582-a2c2-f7d7e06b1cad%20(1).png';

const DRAWER_BG_FALLBACK_SRC =
  'https://fkrqvwarxzmdrexsxtzw.supabase.co/storage/v1/object/public/ui-icons/backgrounds/pusuladan-sana-bg-4.webp';

const PREMIUM_ICON_BASE =
  'https://fkrqvwarxzmdrexsxtzw.supabase.co/storage/v1/object/public/ui-icons/premium';

const PREMIUM_ICON_CACHE_TAG = '20260907-1515';

const premiumIconUrl = (fileName: string) =>
  `${PREMIUM_ICON_BASE}/${fileName}?v=${PREMIUM_ICON_CACHE_TAG}`;

const DRAWER_MENU_FALLBACK_BASE =
  'https://xwyfidtktauxivsosmex.supabase.co/storage/v1/object/public/pusula/menu-icons';

type DrawerItem = {
  label: string;
  target: Screen;
  image?: string;
  fallback?: string;
  iconType?: 'soil' | 'calendar';
};

const ITEMS: DrawerItem[] = [
  {
    label: 'Hava Durumu',
    target: 'weatherHub' as Screen,
    image: 'https://xwyfidtktauxivsosmex.supabase.co/storage/v1/object/public/ui-icons/08-hava-durumu-1.webp',
    fallback: `${DRAWER_MENU_FALLBACK_BASE}/weather.webp`,
  },
  {
    label: 'Depom',
    target: 'inventoryHub' as Screen,
    image: `${DRAWER_MENU_FALLBACK_BASE}/inventory.webp`,
    fallback: `${DRAWER_MENU_FALLBACK_BASE}/inventory.webp`,
  },
  {
    label: 'Piyasa Fiyatları',
    target: 'marketHub' as Screen,
    image: `${DRAWER_MENU_FALLBACK_BASE}/prices.webp`,
    fallback: `${DRAWER_MENU_FALLBACK_BASE}/prices.webp`,
  },
  {
    label: 'Bilgi Rehberi',
    target: 'pestGuideHub' as Screen,
    image: `${DRAWER_MENU_FALLBACK_BASE}/guide.webp`,
    fallback: `${DRAWER_MENU_FALLBACK_BASE}/guide.webp`,
  },
  {
    label: 'Takvim',
    target: 'calendar' as Screen,
    iconType: 'calendar',
  },
  {
    label: 'Bildirimler',
    target: 'notificationsHub' as Screen,
    image: `${DRAWER_MENU_FALLBACK_BASE}/notifications.webp`,
    fallback: `${DRAWER_MENU_FALLBACK_BASE}/notifications.webp`,
  },
  {
    label: 'Ayarlar',
    target: 'settingsHub' as Screen,
    image: `${DRAWER_MENU_FALLBACK_BASE}/settings.webp`,
    fallback: `${DRAWER_MENU_FALLBACK_BASE}/settings.webp`,
  },
];

let pusulaPointsRoot: Root | null = null;
let pusulaPointsContainer: HTMLDivElement | null = null;

function closeDirectPusulaPointsModal() {
  const root = pusulaPointsRoot;
  const container = pusulaPointsContainer;

  pusulaPointsRoot = null;
  pusulaPointsContainer = null;

  if (root) {
    root.unmount();
  }

  container?.remove();
}

function openDirectPusulaPointsModal(points?: number | null) {
  closeDirectPusulaPointsModal();

  const container = document.createElement('div');
  container.id = 'tp-direct-pusula-points-root';
  document.body.appendChild(container);

  const root = createRoot(container);

  pusulaPointsContainer = container;
  pusulaPointsRoot = root;

  root.render(
    <PusulaPointsModal
      open
      points={points}
      onClose={closeDirectPusulaPointsModal}
    />,
  );
}

function DrawerIcon({ item }: { item: DrawerItem }) {
  if (item.iconType === 'calendar') {
    return (
      <span className="tp-premium-drawer-icon tp-premium-drawer-icon-calendar" aria-hidden="true">
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <defs>
            <linearGradient id="tpCalendarPage" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#e6eaee" />
            </linearGradient>
            <linearGradient id="tpCalendarTop" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#727b84" />
              <stop offset="100%" stopColor="#343a40" />
            </linearGradient>
          </defs>
          <rect x="7" y="8.5" width="34" height="32" rx="7" fill="url(#tpCalendarPage)" stroke="#aeb5bc" strokeWidth="1.6" />
          <path d="M7.8 18.2h32.4v-3.1c0-3.4-2.7-6.1-6.1-6.1H13.9c-3.4 0-6.1 2.7-6.1 6.1v3.1Z" fill="url(#tpCalendarTop)" />
          <path d="M16 6.5v6.2M32 6.5v6.2" fill="none" stroke="#2d3338" strokeWidth="3.2" strokeLinecap="round" />
          <rect x="12.5" y="22.5" width="6" height="5.5" rx="1.3" fill="#707982" />
          <rect x="21" y="22.5" width="6" height="5.5" rx="1.3" fill="#b0b7bd" />
          <rect x="29.5" y="22.5" width="6" height="5.5" rx="1.3" fill="#707982" />
          <rect x="12.5" y="31" width="6" height="5.5" rx="1.3" fill="#b0b7bd" />
          <rect x="21" y="31" width="6" height="5.5" rx="1.3" fill="#5b646c" />
          <rect x="29.5" y="31" width="6" height="5.5" rx="1.3" fill="#b0b7bd" />
        </svg>
      </span>
    );
  }

  if (item.iconType === 'soil') {
    return (
      <span className="tp-premium-drawer-icon tp-premium-drawer-icon-soil" aria-hidden="true">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4.25v7.9" />
          <path d="M8.2 7.1c1.05.95 2.3 1.45 3.8 1.45" />
          <path d="M15.8 6.9c-1 .98-2.28 1.5-3.8 1.5" />
          <path d="M5.1 13.35c2.35.7 4.62 1.05 6.9 1.05s4.55-.35 6.9-1.05" />
          <path d="M6.35 16.15c1.82.55 3.72.82 5.65.82 1.93 0 3.83-.27 5.65-.82" />
          <path d="M7.55 18.95c1.42.38 2.91.58 4.45.58 1.54 0 3.03-.2 4.45-.58" />
        </svg>
      </span>
    );
  }

  return (
    <span className="tp-premium-drawer-icon">
      <img
        src={item.image || ''}
        alt=""
        aria-hidden="true"
        crossOrigin="anonymous"
        draggable={false}
        onError={(event) => {
          const image = event.currentTarget;
          if (image.dataset.tpFallback !== '1' && item.fallback) {
            image.dataset.tpFallback = '1';
            image.src = item.fallback;
          }
        }}
      />
    </span>
  );
}

export default function AppDrawer({
  open,
  activeScreen,
  onClose,
  onNavigate,
  profileName,
  points,
}: AppDrawerProps) {
  const gamification = useGamificationStore();
  const [resolvedName, setResolvedName] = useState(
    String(profileName || '').trim() || 'Üretici',
  );
  const drawerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const explicitName = String(profileName || '').trim();
    if (explicitName) {
      setResolvedName(explicitName);
      return;
    }

    let alive = true;

    void (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!alive) return;

        const user = data.user;
        const metadata = user?.user_metadata ?? {};
        const fromMetadata =
          String(
            metadata.full_name ??
              metadata.name ??
              metadata.display_name ??
              metadata.username ??
              '',
          ).trim();

        const fromEmail = String(user?.email ?? '')
          .split('@')[0]
          .replace(/[._-]+/g, ' ')
          .trim();

        setResolvedName(fromMetadata || fromEmail || 'Üretici');
      } catch {
        if (alive) setResolvedName('Üretici');
      }
    })();

    return () => {
      alive = false;
    };
  }, [profileName]);

  useEffect(() => {
    if (!open) return;

    const applyNativeMobileOffset = () => {
      const drawer = drawerRef.current;
      if (!drawer) return;

      const isPhone = window.matchMedia('(max-width: 520px)').matches;

      if (isPhone) {
        // Hard native guard: keep the whole drawer comfortably below the
        // iPhone status bar / Dynamic Island. Use !important at runtime so
        // legacy theme rules cannot pull it back to top:0.
        drawer.style.setProperty('inset', 'auto auto 0 0', 'important');
        drawer.style.setProperty('top', '72px', 'important');
        drawer.style.setProperty('bottom', '0', 'important');
        drawer.style.setProperty('left', '0', 'important');
        drawer.style.setProperty('right', 'auto', 'important');
        drawer.style.setProperty('height', 'auto', 'important');
        drawer.style.setProperty('max-height', 'calc(100dvh - 72px)', 'important');
      } else {
        for (const property of [
          'inset',
          'top',
          'bottom',
          'left',
          'right',
          'height',
          'max-height',
        ]) {
          drawer.style.removeProperty(property);
        }
      }
    };

    applyNativeMobileOffset();
    window.addEventListener('resize', applyNativeMobileOffset);
    window.addEventListener('orientationchange', applyNativeMobileOffset);

    return () => {
      window.removeEventListener('resize', applyNativeMobileOffset);
      window.removeEventListener('orientationchange', applyNativeMobileOffset);
    };
  }, [open]);

  const shownPoints = useMemo(() => {
    const explicit = Number(points);
    if (Number.isFinite(explicit)) return explicit;

    const storePoints = Number((gamification as any)?.points);
    return Number.isFinite(storePoints) ? storePoints : null;
  }, [points, gamification]);

  if (!open) return null;

  const handleLogout = async () => {
    onClose();

    try {
      await supabase.auth.signOut();
    } finally {
      window.location.reload();
    }
  };

  return (
    <>
      <style>{`
        @keyframes tpPremiumDrawerIn{
          from{transform:translateX(-28px);opacity:.55}
          to{transform:translateX(0);opacity:1}
        }

        .tp-premium-drawer-backdrop{
          position:fixed;
          inset:0;
          z-index:2147483490;
          border:0;
          padding:0;
          background:rgba(0,5,2,.66);
          backdrop-filter:blur(9px) saturate(.82);
          -webkit-backdrop-filter:blur(9px) saturate(.82);
        }

        .tp-premium-drawer{
          position:fixed;
          z-index:2147483500;
          inset:0 auto 0 0;
          width:min(88vw,392px);
          padding:16px 18px 16px;
          display:flex;
          flex-direction:column;
          overflow-y:auto;
          overflow-x:hidden;
          color:#f2ead9;
          isolation:isolate;
          animation:tpPremiumDrawerIn .22s cubic-bezier(.2,.8,.2,1);

          background:
            linear-gradient(180deg,rgba(1,12,6,.48) 0%,rgba(2,11,6,.60) 48%,rgba(1,7,4,.74) 100%),
            radial-gradient(circle at 11% 4%,rgba(73,244,127,.16),transparent 27%),
            radial-gradient(circle at 94% 48%,rgba(98,235,134,.08),transparent 30%),
            url("${DRAWER_BG_SRC}") center center / cover no-repeat,
            url("${DRAWER_BG_FALLBACK_SRC}") center 66% / cover no-repeat,
            #020a05;

          border:1px solid rgba(107,239,145,.48);
          border-left:0;
          border-radius:0 26px 26px 0;

          box-shadow:
            20px 0 70px rgba(0,0,0,.62),
            0 0 0 1px rgba(111,237,146,.07),
            0 0 32px rgba(64,219,109,.20),
            inset -1px 0 0 rgba(202,255,214,.13);
        }

        .tp-premium-drawer::before{
          content:'';
          position:absolute;
          inset:0;
          z-index:-1;
          pointer-events:none;
          background:
            radial-gradient(circle at 0 13%,rgba(72,255,132,.15),transparent 25%),
            radial-gradient(circle at 82% 70%,rgba(159,255,179,.10),transparent 24%),
            radial-gradient(circle at 12% 92%,rgba(229,197,105,.055),transparent 24%),
            linear-gradient(90deg,rgba(2,20,9,.08),rgba(2,10,6,.37));
        }

        .tp-premium-drawer-atmosphere{
          position:absolute;
          inset:0;
          z-index:0;
          pointer-events:none;
          overflow:hidden;
          border-radius:inherit;
        }

        .tp-premium-drawer-atmosphere::before{
          content:'';
          position:absolute;
          left:-22%;
          right:-18%;
          top:27%;
          bottom:-7%;
          background:
            linear-gradient(180deg,transparent 0%,rgba(0,8,3,.05) 18%,rgba(0,8,3,.26) 100%),
            url("${DRAWER_BG_SRC}") center center / cover no-repeat,
            url("${DRAWER_BG_FALLBACK_SRC}") center 72% / 118% auto no-repeat;
          opacity:.34;
          transform:scaleX(-1);
          filter:saturate(1.12) contrast(1.05);
          -webkit-mask-image:linear-gradient(180deg,transparent 0%,#000 16%,#000 100%);
          mask-image:linear-gradient(180deg,transparent 0%,#000 16%,#000 100%);
        }

        .tp-premium-drawer-atmosphere::after{
          content:'';
          position:absolute;
          inset:0;
          background:
            radial-gradient(circle at 3% 8%,rgba(81,255,136,.25) 0 1px,transparent 2px),
            radial-gradient(circle at 88% 28%,rgba(214,231,165,.18) 0 1px,transparent 2px),
            radial-gradient(circle at 12% 63%,rgba(85,242,132,.14) 0 1px,transparent 2px),
            radial-gradient(circle at 77% 86%,rgba(240,216,141,.14) 0 1px,transparent 2px);
          background-size:117px 173px,151px 199px,183px 137px,211px 181px;
          opacity:.65;
          mix-blend-mode:screen;
        }

        .tp-premium-drawer > :not(.tp-premium-drawer-atmosphere){
          position:relative;
          z-index:2;
        }

        .tp-premium-drawer::after{
          content:'';
          position:absolute;
          left:7%;
          right:7%;
          top:0;
          height:1px;
          z-index:4;
          background:linear-gradient(
            90deg,
            transparent,
            rgba(94,255,143,.88),
            rgba(238,219,153,.48),
            rgba(94,255,143,.88),
            transparent
          );
          box-shadow:
            0 0 9px rgba(91,255,141,.55),
            0 0 26px rgba(91,255,141,.18);
          pointer-events:none;
        }

        .tp-premium-drawer-top{
          position:relative;
          display:grid;
          grid-template-columns:64px minmax(0,1fr) 38px;
          gap:12px;
          align-items:start;
          padding:4px 2px 14px;
          border-bottom:1px solid rgba(152,211,165,.16);
        }

        .tp-premium-drawer-brand-mark{
          width:64px;
          height:64px;
          object-fit:contain;
          filter:
            drop-shadow(0 7px 12px rgba(0,0,0,.42))
            drop-shadow(0 0 9px rgba(84,239,126,.22));
        }

        .tp-premium-drawer-welcome{
          min-width:0;
          padding-top:2px;
        }

        .tp-premium-drawer-brand-name{
          display:block;
          margin-bottom:5px;
          font-family:Georgia,'Times New Roman',serif;
          color:#efe7d4;
          font-size:23px;
          line-height:1;
          font-weight:650;
          letter-spacing:-.02em;
        }

        .tp-premium-drawer-brand-name em{
          color:#9fd5a3;
          font-style:normal;
        }

        .tp-premium-drawer-welcome small{
          display:block;
          margin-top:8px;
          color:#b9c3b9;
          font-size:10px;
          line-height:1.1;
        }

        .tp-premium-drawer-welcome strong{
          display:block;
          margin-top:3px;
          color:#f1eee5;
          font-family:Georgia,'Times New Roman',serif;
          font-size:17px;
          font-weight:600;
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
        }

        .tp-premium-drawer-welcome p{
          margin:4px 0 0;
          color:#8f9b90;
          font-size:9px;
          line-height:1.35;
        }

        .tp-premium-drawer-x{
          width:36px;
          height:36px;
          display:grid;
          place-items:center;
          padding:0;
          border:0;
          background:transparent;
          color:#e7eee8;
          font-size:29px;
          font-weight:200;
          line-height:1;
          cursor:pointer;
          text-shadow:0 0 10px rgba(91,255,141,.20);
        }

        .tp-premium-points{
          width:calc(100% - 76px);
          min-height:38px;
          margin:10px 0 9px 76px;
          padding:0 12px;
          display:grid;
          grid-template-columns:auto 1fr auto auto;
          gap:7px;
          align-items:center;
          border:1px solid rgba(224,195,111,.58);
          border-radius:999px;
          background:
            linear-gradient(180deg,rgba(22,35,20,.54),rgba(6,15,9,.42));
          color:#e9d18b;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.035),
            0 0 16px rgba(207,177,91,.07);
          backdrop-filter:blur(12px);
          -webkit-backdrop-filter:blur(12px);
        }

        .tp-premium-points img{
          width:22px;
          height:22px;
          object-fit:contain;
          border-radius:6px;
        }

        .tp-premium-points span{
          font-size:10px;
          font-weight:800;
        }

        .tp-premium-points strong{
          color:#f0f1e9;
          font-size:13px;
          font-weight:800;
        }

        .tp-premium-points i{
          font-style:normal;
          font-size:18px;
          color:#d5bf7e;
        }

        .tp-premium-drawer-nav{
          display:grid;
          margin-top:4px;
          border-top:1px solid rgba(132,190,145,.11);
        }

        .tp-premium-drawer-nav > button{
          min-height:55px;
          display:grid;
          grid-template-columns:45px minmax(0,1fr) 18px;
          align-items:center;
          gap:10px;
          padding:4px 8px 4px 4px;
          border:0;
          border-bottom:1px solid rgba(132,190,145,.15);
          border-radius:0;
          background:transparent;
          color:#efece3;
          text-align:left;
          cursor:pointer;
          transition:
            background .16s ease,
            transform .16s ease,
            border-color .16s ease;
        }

        .tp-premium-drawer-nav > button:hover,
        .tp-premium-drawer-nav > button.active{
          background:
            linear-gradient(90deg,rgba(42,126,68,.13),rgba(14,48,27,.07),transparent);
          border-bottom-color:rgba(96,234,134,.23);
        }

        .tp-premium-drawer-nav > button:active{
          transform:translateX(2px);
        }

        .tp-premium-drawer-icon{
          width:42px;
          height:42px;
          display:grid;
          place-items:center;
          border-radius:12px;
          border:1px solid rgba(97,227,132,.25);
          background:
            radial-gradient(circle at 50% 28%,rgba(111,255,153,.10),transparent 55%),
            rgba(3,22,11,.43);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.03),
            0 0 11px rgba(75,225,118,.08);
          overflow:hidden;
        }

        .tp-premium-drawer-icon img{
          width:39px;
          height:39px;
          display:block;
          object-fit:cover;
          border-radius:10px;
          filter:
            saturate(1.03)
            drop-shadow(0 4px 7px rgba(0,0,0,.28));
        }

        .tp-premium-drawer-icon svg{
          width:25px;
          height:25px;
          fill:none;
          stroke:#d6dee5;
          stroke-width:1.55;
          stroke-linecap:round;
          stroke-linejoin:round;
          filter:
            drop-shadow(0 0 5px rgba(255,255,255,.18))
            drop-shadow(0 4px 6px rgba(0,0,0,.22));
        }

        /* CALENDAR ICON — premium monochrome drawer family */
        .tp-premium-drawer-icon-calendar{
          border-color:#cbd1d6!important;
          background:
            radial-gradient(circle at 50% 18%,rgba(255,255,255,.95),transparent 52%),
            linear-gradient(180deg,#f8fafb 0%,#e7ebee 100%)!important;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.96),
            inset 0 -1px 0 rgba(91,100,108,.12),
            0 4px 10px rgba(17,24,39,.10)!important;
        }

        .tp-premium-drawer-icon-calendar svg{
          width:36px!important;
          height:36px!important;
          overflow:visible!important;
          filter:drop-shadow(0 2px 2px rgba(17,24,39,.16))!important;
        }

        .tp-premium-drawer-icon-soil{
          border-color:rgba(197,205,214,.62);
          background:
            radial-gradient(circle at 50% 28%,rgba(255,255,255,.42),transparent 58%),
            linear-gradient(180deg,#f7f9fb 0%,#eef2f5 100%);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.92),
            0 4px 12px rgba(15,23,42,.08);
        }

        .tp-premium-drawer-icon-soil svg{
          width:24px;
          height:24px;
          stroke:#b7d7b9;
          filter:none;
        }

        .tp-premium-drawer-nav > button > span:nth-child(2){
          color:#e7e8df;
          font-size:13px;
          font-weight:650;
          letter-spacing:-.01em;
        }

        .tp-premium-drawer-nav > button > i{
          color:#e5ebe5;
          font-style:normal;
          font-size:22px;
          font-weight:250;
          text-align:right;
        }

        .tp-premium-drawer-logout{
          min-height:45px;
          width:60%;
          margin-top:12px;
          display:flex;
          align-items:center;
          justify-content:flex-start;
          gap:10px;
          padding:0 15px;
          border:1px solid rgba(234,118,70,.72);
          border-radius:999px;
          background:
            linear-gradient(90deg,rgba(96,27,13,.20),rgba(25,15,8,.18));
          color:#f0a078;
          font-size:12px;
          font-weight:750;
          cursor:pointer;
          box-shadow:0 0 14px rgba(236,102,55,.06);
        }

        .tp-premium-drawer-logout-icon{
          width:27px;
          height:27px;
          flex:0 0 auto;
          object-fit:cover;
          border-radius:8px;
          filter:
            saturate(1.02)
            drop-shadow(0 4px 7px rgba(0,0,0,.30));
        }

        .tp-premium-drawer-foot-art{
          position:relative;
          min-height:104px;
          margin-top:2px;
          pointer-events:none;
          overflow:hidden;
          border-radius:18px;
          background:
            radial-gradient(circle at 18% 96%,rgba(69,235,118,.12),transparent 35%),
            linear-gradient(180deg,transparent,rgba(2,12,6,.18));
        }

        .tp-premium-drawer-foot-art::before{
          content:'';
          position:absolute;
          left:-28px;
          bottom:-66px;
          width:178px;
          height:178px;
          border-radius:50%;
          border:1px solid rgba(112,227,139,.13);
          box-shadow:
            0 0 0 18px rgba(91,224,126,.025),
            0 0 0 42px rgba(91,224,126,.018);
        }

        .tp-premium-drawer-foot-art span{
          position:absolute;
          right:8px;
          bottom:18px;
          width:112px;
          color:#d7e5d7;
          font-size:9px;
          line-height:1.75;
          font-weight:800;
          letter-spacing:.22em;
        }


        /* Opsiyon D — dinamik Pusula Puanı */
        .tp-premium-points-opd{
          width:100%!important;
          min-height:62px!important;
          margin:11px 0 10px!important;
          grid-template-columns:48px minmax(0,1fr) auto 15px!important;
          border:1px solid #d7dde2!important;
          background:#f7f9fa!important;
          color:#20252b!important;
          box-shadow:0 5px 16px rgba(17,24,39,.08)!important;
          appearance:none!important;
          -webkit-appearance:none!important;
          font:inherit!important;
          text-align:left!important;
          cursor:pointer!important;
        }

        .tp-premium-points-opd:hover{
          background:#ffffff!important;
          border-color:#bfc8cf!important;
        }

        .tp-premium-points-opd:active{
          transform:translateY(1px);
        }

        .tp-premium-points-opd-emblem{
          position:relative;
          width:48px;
          height:48px;
          display:block;
          overflow:hidden;
          border-radius:50%;
          box-shadow:
            0 0 0 1px rgba(222,191,98,.48),
            0 0 11px rgba(68,221,112,.12);
        }

        .tp-premium-points-opd-emblem img{
          position:absolute!important;
          width:250px!important;
          height:auto!important;
          max-width:none!important;
          left:-42px!important;
          top:-14px!important;
          border-radius:0!important;
          object-fit:initial!important;
        }

        .tp-premium-points-opd span:not(.tp-premium-points-opd-emblem){
          color:#3f4952!important;
          font-size:9px!important;
          letter-spacing:.08em!important;
        }

        .tp-premium-points-opd strong{
          color:#20252b!important;
          font-size:14px!important;
          font-weight:900!important;
        }

        .tp-premium-points-opd > i{
          color:#20252b!important;
        }


        /* DRAWER IS THE ONLY APP CHROME WHILE OPEN.
           Global/header bars use extremely high z-index values (one of them
           is 2147483647), so raising the drawer alone can never reliably win.
           Hide fixed app chrome while the drawer exists; restore automatically
           when the drawer unmounts. */
        body:has(.tp-premium-drawer) .tp-global-page-header,
        body:has(.tp-premium-drawer) .tp-v1-header,
        body:has(.tp-premium-drawer) .tp-classic-bottom-nav,
        body:has(.tp-premium-drawer) .tp-field-detail-bottom,
        body:has(.tp-premium-drawer) .bottomNav{
          display:none!important;
          visibility:hidden!important;
          pointer-events:none!important;
        }

        body:has(.tp-premium-drawer){
          overflow:hidden!important;
          overscroll-behavior:none!important;
        }

        /* DRAWER FOOTER CLEANUP V2 */
        body:has(.tp-premium-drawer) .tp-admin-entry{
          display:none!important;
        }

        .tp-premium-drawer .tp-premium-drawer-logout{
          box-sizing:border-box!important;
          width:100%!important;
          min-height:48px!important;
          margin:12px 0 0!important;
          padding:0 13px!important;
          display:grid!important;
          grid-template-columns:32px minmax(0,1fr)!important;
          align-items:center!important;
          justify-content:stretch!important;
          gap:10px!important;
          border:1px solid #050607!important;
          border-radius:14px!important;
          background:#050607!important;
          background-image:none!important;
          color:#fff!important;
          -webkit-text-fill-color:#fff!important;
          box-shadow:none!important;
          text-align:left!important;
          font-size:12px!important;
          font-weight:850!important;
          letter-spacing:0!important;
        }

        .tp-premium-drawer .tp-premium-drawer-logout-icon{
          width:32px!important;
          height:32px!important;
          border-radius:9px!important;
          object-fit:cover!important;
          filter:grayscale(1) contrast(1.08)!important;
        }

        .tp-premium-drawer .tp-premium-drawer-foot-art{
          box-sizing:border-box!important;
          min-height:0!important;
          height:auto!important;
          margin:9px 0 0!important;
          padding:9px 4px 3px!important;
          overflow:visible!important;
          border-radius:0!important;
          border-top:1px solid rgba(255,255,255,.13)!important;
          background:none!important;
        }

        .tp-premium-drawer .tp-premium-drawer-foot-art::before{
          display:none!important;
          content:none!important;
        }

        .tp-premium-drawer .tp-premium-drawer-foot-art span{
          position:static!important;
          inset:auto!important;
          width:auto!important;
          display:block!important;
          margin:0!important;
          color:rgba(255,255,255,.58)!important;
          -webkit-text-fill-color:rgba(255,255,255,.58)!important;
          text-align:center!important;
          font-size:7.5px!important;
          line-height:1.35!important;
          font-weight:850!important;
          letter-spacing:.18em!important;
          white-space:normal!important;
        }

        @media(max-width:520px){
          .tp-premium-drawer{
            /* Native iPhone: keep the whole drawer below the status-bar /
               Dynamic Island zone. env(safe-area-inset-top) may be reported
               as 0 in some Capacitor/WebView configurations, so keep a
               physical fallback as well. */
            inset:auto auto 0 0!important;
            top:72px!important;
            bottom:0!important;
            left:0!important;
            right:auto!important;
            height:auto!important;
            max-height:calc(100dvh - 72px)!important;
            width:min(92vw,360px);
            padding:13px 14px max(12px, env(safe-area-inset-bottom));
            border-radius:0 26px 26px 0;
          }

          .tp-premium-drawer-top{
            grid-template-columns:57px minmax(0,1fr) 44px;
            gap:10px;
            align-items:start;
          }

          .tp-premium-drawer-x{
            width:44px;
            height:44px;
            min-width:44px;
            min-height:44px;
            margin-top:0;
            border-radius:13px;
            background:rgba(255,255,255,.08);
            border:1px solid rgba(255,255,255,.16);
            font-size:27px;
            -webkit-tap-highlight-color:transparent;
            touch-action:manipulation;
          }

          .tp-premium-drawer-brand-mark{
            width:57px;
            height:57px;
          }

          .tp-premium-drawer-brand-name{
            font-size:20px;
          }

          .tp-premium-points{
            width:100%;
            margin-left:0;
          }

          .tp-premium-drawer-nav > button{
            min-height:52px;
            grid-template-columns:42px minmax(0,1fr) 17px;
          }

          .tp-premium-drawer-icon{
            width:39px;
            height:39px;
          }

          .tp-premium-drawer-icon img{
            width:36px;
            height:36px;
          }
        }
      `}</style>

      <button
        type="button"
        className="tp-premium-drawer-backdrop"
        aria-label="Menüyü kapat"
        onClick={onClose}
      />

      <aside ref={drawerRef} className="tp-premium-drawer">
        <div className="tp-premium-drawer-atmosphere" aria-hidden="true" />

        <div className="tp-premium-drawer-top">
          <img
            className="tp-premium-drawer-brand-mark"
            src={PUSULA_BODY_SRC}
            alt="Pusula"
            crossOrigin="anonymous"
            draggable={false}
          />

          <div className="tp-premium-drawer-welcome">
            <span className="tp-premium-drawer-brand-name">
              Tarla<em>Pusula</em>
            </span>
            <small>Hoş geldin,</small>
            <strong>{resolvedName}</strong>
            <p>Daha verimli yarınlar için birlikte...</p>
          </div>

          <button
            type="button"
            className="tp-premium-drawer-x"
            onClick={onClose}
            aria-label="Menüyü kapat"
          >
            ×
          </button>
        </div>

        <button
          type="button"
          className="tp-premium-points tp-premium-points-opd"
          onClick={() => {
            // Drawer kapanmadan önce bağımsız modal root'unu body'ye monte et.
            // Böylece drawer'ın unmount olması puan ekranını etkileyemez.
            openDirectPusulaPointsModal(shownPoints);
            onClose();
          }}
          aria-label="Pusula puanı, seviyeler ve puan geçmişini aç"
        >
          <span className="tp-premium-points-opd-emblem" aria-hidden="true">
            <img
              src={premiumIconUrl('pusula-puani-opD.webp')}
              alt=""
              crossOrigin="anonymous"
              draggable={false}
              onError={(event) => {
                const image = event.currentTarget;

                if (image.dataset.tpFallback !== '1') {
                  image.dataset.tpFallback = '1';
                  image.src = PUSULA_BODY_SRC;
                }
              }}
            />
          </span>

          <span>Pusula Puanı</span>

          <strong>
            {shownPoints == null
              ? '—'
              : `${shownPoints.toLocaleString('tr-TR')} P`}
          </strong>

          <i>›</i>
        </button>

        <nav className="tp-premium-drawer-nav">
          {ITEMS.map((item) => {
            const active =
              String(activeScreen ?? '') === String(item.target);

            return (
              <button
                key={item.label}
                type="button"
                className={active ? 'active' : ''}
                onClick={() => onNavigate(item.target, item.label)}
              >
                <DrawerIcon item={item} />
                <span>{item.label}</span>
                <i>›</i>
              </button>
            );
          })}
        </nav>

        <DrawerSupportFooter screen={String(activeScreen ?? '')} />

        <button
          type="button"
          className="tp-premium-drawer-logout"
          onClick={() => void handleLogout()}
        >
          <img
            className="tp-premium-drawer-logout-icon"
            src={premiumIconUrl('21-cikis-yap.webp')}
            alt=""
            aria-hidden="true"
            crossOrigin="anonymous"
            draggable={false}
          />
          Çıkış Yap
        </button>

        <div className="tp-premium-drawer-foot-art" aria-hidden="true">
          <span>DAHA VERİMLİ YARINLAR İÇİN</span>
        </div>
      </aside>
    </>
  );
}
