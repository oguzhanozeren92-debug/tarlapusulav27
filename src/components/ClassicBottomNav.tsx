import {
  CalendarDays,
  CloudSun,
  House,
  MapPinned,
  Sparkles,
} from 'lucide-react';

import type { Screen } from '../types';

type ClassicBottomNavProps = {
  activeScreen?: Screen | string;
  setScreen?: (screen: Screen) => void;
  onOpenAi?: () => void;
  onOpenCalendar?: () => void;
  onOpenFields?: () => void;
};

const CLASSIC_BOTTOM_NAV_CSS = String.raw`
.tp-classic-bottom-spacer {
  height: 82px;
  min-height: 82px;
}

.tp-classic-bottom-nav {
  position: fixed;
  z-index: 2147481500;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);

  width: min(100%, 760px);
  min-height: 72px;

  box-sizing: border-box;

  padding:
    6px
    8px
    max(7px, env(safe-area-inset-bottom));

  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  align-items: center;

  gap: 0;

  background: #050607;

  border-top:
    1px solid rgba(255,255,255,.08);

  box-shadow:
    0 -10px 30px rgba(0,0,0,.32);

  backdrop-filter:
    blur(18px)
    saturate(120%);

  -webkit-backdrop-filter:
    blur(18px)
    saturate(120%);
}


/* BUTONLAR */

.tp-classic-bottom-nav button {
  appearance: none;
  -webkit-appearance: none;

  border: 0 !important;
  outline: 0;

  margin: 0;

  min-width: 0;
  min-height: 59px;

  padding: 3px 1px;

  display: flex;
  flex-direction: column;

  align-items: center;
  justify-content: center;

  gap: 3px;

  background: transparent !important;

  box-shadow: none !important;

  color: #ffffff !important;

  font:
    500 9px/1.05
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;

  letter-spacing: -.01em;

  white-space: nowrap;

  cursor: pointer;

  -webkit-tap-highlight-color: transparent;
}


/* İKON */

.tp-classic-bottom-icon {
  width: 34px;
  height: 32px;

  box-sizing: border-box;

  display: grid;
  place-items: center;

  border-radius: 10px;

  background: transparent;

  color: #ffffff !important;

  transition:
    background .18s ease,
    color .18s ease,
    transform .15s ease,
    box-shadow .18s ease;
}

.tp-classic-bottom-icon svg {
  width: 20px;
  height: 20px;

  color: #ffffff !important;
  stroke: #ffffff !important;
}


/* YAZILAR KESİNLİKLE BEYAZ */

.tp-classic-bottom-label {
  display: block;

  color: #ffffff !important;

  -webkit-text-fill-color: #ffffff !important;

  opacity: 1 !important;

  text-shadow: none !important;
}


/* AKTİF BUTON */

.tp-classic-bottom-nav button.active {
  background: transparent !important;

  color: #ffffff !important;

  box-shadow: none !important;
}


/* SADECE AKTİF İKONUN ARKASI BEYAZ */

.tp-classic-bottom-nav
button.active
.tp-classic-bottom-icon {
  background: #ffffff;

  color: #060708 !important;

  box-shadow:
    0 4px 12px rgba(0,0,0,.26),
    0 0 0 1px rgba(255,255,255,.10);

  transform: translateY(-1px);
}

.tp-classic-bottom-nav
button.active
.tp-classic-bottom-icon svg {
  color: #060708 !important;

  stroke: #060708 !important;
}


/* AKTİF YAZI DA BEYAZ */

.tp-classic-bottom-nav
button.active
.tp-classic-bottom-label {
  color: #ffffff !important;

  -webkit-text-fill-color: #ffffff !important;

  opacity: 1 !important;
}


/* BASMA */

.tp-classic-bottom-nav
button:active
.tp-classic-bottom-icon {
  transform: scale(.94);
}


/* FOCUS */

.tp-classic-bottom-nav
button:focus-visible
.tp-classic-bottom-icon {
  outline:
    2px solid rgba(255,255,255,.75);

  outline-offset: 2px;
}


/* MOBİL */

@media (max-width: 560px) {

  .tp-classic-bottom-nav {
    min-height: 70px;

    padding-left: 5px;
    padding-right: 5px;
  }

  .tp-classic-bottom-nav button {
    min-height: 57px;

    font-size: 8px;
  }

  .tp-classic-bottom-icon {
    width: 32px;
    height: 30px;

    border-radius: 9px;
  }

  .tp-classic-bottom-icon svg {
    width: 19px;
    height: 19px;
  }

  .tp-classic-bottom-spacer {
    height: 79px;
    min-height: 79px;
  }
}


@media (max-width: 390px) {

  .tp-classic-bottom-nav {
    padding-left: 3px;
    padding-right: 3px;
  }

  .tp-classic-bottom-nav button {
    font-size: 7.4px;
  }

  .tp-classic-bottom-icon {
    width: 31px;
    height: 29px;
  }

  .tp-classic-bottom-icon svg {
    width: 18px;
    height: 18px;
  }
}
`;

export default function ClassicBottomNav({
  activeScreen,
  setScreen,
  onOpenAi,
  onOpenCalendar,
  onOpenFields,
}: ClassicBottomNavProps) {

  const go = (screen: Screen) => {
    setScreen?.(screen);
  };


  const goFields = () => {

    if (onOpenFields) {
      onOpenFields();
      return;
    }


    go('home');


    window.setTimeout(() => {

      const fieldsButton =
        document.querySelector(
          'button[aria-label="Tarlalarım listesini aç"]',
        ) as HTMLButtonElement | null;


      if (fieldsButton) {
        fieldsButton.click();
        return;
      }


      document
        .querySelector(
          '.tp-home-field, .tp-homev3-fields-section, .fieldsSection',
        )
        ?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });

    }, 100);
  };


  const goAi = () => {

    if (onOpenAi) {
      onOpenAi();
      return;
    }

    go('aiAnalysis');
  };


  const goCalendar = () => {

    if (onOpenCalendar) {
      onOpenCalendar();
      return;
    }

    go('calendar');
  };


  const fieldsActive =
    activeScreen === 'fields' ||
    activeScreen === 'fieldsHub';


  return (
    <>

      <style>
        {CLASSIC_BOTTOM_NAV_CSS}
      </style>


      <div
        className="tp-classic-bottom-spacer"
        aria-hidden="true"
      />


      <nav
        className="tp-classic-bottom-nav"
        aria-label="Ana menü"
      >


        <button
          type="button"
          className={
            activeScreen === 'home'
              ? 'active'
              : ''
          }
          aria-current={
            activeScreen === 'home'
              ? 'page'
              : undefined
          }
          onClick={() => go('home')}
        >

          <span className="tp-classic-bottom-icon">
            <House strokeWidth={1.8} />
          </span>

          <span className="tp-classic-bottom-label">
            Ana Sayfa
          </span>

        </button>



        <button
          type="button"
          className={
            activeScreen === 'weatherHub'
              ? 'active'
              : ''
          }
          aria-current={
            activeScreen === 'weatherHub'
              ? 'page'
              : undefined
          }
          onClick={() => go('weatherHub')}
        >

          <span className="tp-classic-bottom-icon">
            <CloudSun strokeWidth={1.8} />
          </span>

          <span className="tp-classic-bottom-label">
            Hava Durumu
          </span>

        </button>



        <button
          type="button"
          className={
            activeScreen === 'aiAnalysis'
              ? 'active'
              : ''
          }
          aria-current={
            activeScreen === 'aiAnalysis'
              ? 'page'
              : undefined
          }
          onClick={goAi}
        >

          <span className="tp-classic-bottom-icon">
            <Sparkles strokeWidth={1.8} />
          </span>

          <span className="tp-classic-bottom-label">
            Pusula AI
          </span>

        </button>



        <button
          type="button"
          className={
            activeScreen === 'calendar'
              ? 'active'
              : ''
          }
          aria-current={
            activeScreen === 'calendar'
              ? 'page'
              : undefined
          }
          onClick={goCalendar}
        >

          <span className="tp-classic-bottom-icon">
            <CalendarDays strokeWidth={1.8} />
          </span>

          <span className="tp-classic-bottom-label">
            Takvim
          </span>

        </button>



        <button
          type="button"
          className={
            fieldsActive
              ? 'active'
              : ''
          }
          aria-current={
            fieldsActive
              ? 'page'
              : undefined
          }
          onClick={goFields}
          aria-label="Tarlalarım listesini aç"
        >

          <span className="tp-classic-bottom-icon">
            <MapPinned strokeWidth={1.8} />
          </span>

          <span className="tp-classic-bottom-label">
            Tarlalarım
          </span>

        </button>


      </nav>

    </>
  );
}