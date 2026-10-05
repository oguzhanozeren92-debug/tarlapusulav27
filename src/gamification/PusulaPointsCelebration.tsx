import { useEffect, useMemo } from 'react';
import { Compass, Sparkles } from 'lucide-react';
import { createPortal } from 'react-dom';
import {
  clearLastAward,
  getUnlockedFieldCount,
  useGamificationStore,
} from './useGamificationStore';

const CSS = String.raw`
.tp-point-celebration{
  position:fixed;
  inset:0;
  z-index:2147483300;
  display:grid;
  place-items:center;
  pointer-events:none;
  font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
}

.tp-point-celebration__wash{
  position:absolute;
  inset:0;
  background:radial-gradient(circle at 50% 46%,rgba(255,255,255,.15),transparent 30%);
  animation:tp-point-wash 1.7s ease-out both;
}

.tp-point-celebration__card{
  position:relative;
  width:min(calc(100vw - 34px),360px);
  padding:18px 18px 15px;
  overflow:hidden;
  border:1px solid rgba(255,255,255,.9);
  border-radius:24px;
  background:rgba(13,15,18,.96);
  color:#fff;
  box-shadow:
    0 24px 70px rgba(0,0,0,.42),
    inset 0 0 0 1px rgba(255,255,255,.08);
  transform-origin:center;
  animation:tp-point-card 2.35s cubic-bezier(.2,.82,.2,1) both;
}

.tp-point-celebration__card.is-milestone{
  padding-top:21px;
  animation-duration:3.1s;
  box-shadow:
    0 26px 78px rgba(0,0,0,.5),
    0 0 0 7px rgba(255,255,255,.09),
    inset 0 0 0 1px rgba(255,255,255,.12);
}

.tp-point-celebration__shine{
  position:absolute;
  inset:-70% auto -70% -45%;
  width:38%;
  transform:rotate(18deg);
  background:linear-gradient(90deg,transparent,rgba(255,255,255,.18),transparent);
  animation:tp-point-shine 1.45s .12s ease-out both;
}

.tp-point-celebration__top{
  position:relative;
  display:flex;
  align-items:center;
  gap:13px;
}

.tp-point-celebration__logo{
  position:relative;
  width:54px;
  height:54px;
  flex:0 0 54px;
  display:grid;
  place-items:center;
  border:1px solid rgba(255,255,255,.24);
  border-radius:18px;
  background:#fff;
  color:#0d0f12;
  box-shadow:0 0 28px rgba(255,255,255,.18);
}

.tp-point-celebration__logo::before,
.tp-point-celebration__logo::after{
  content:"";
  position:absolute;
  inset:-8px;
  border:1px solid rgba(255,255,255,.24);
  border-radius:22px;
  animation:tp-point-ring 1.55s ease-out both;
}

.tp-point-celebration__logo::after{
  inset:-15px;
  opacity:.45;
  animation-delay:.12s;
}

.tp-point-celebration__logo svg{
  width:27px;
  height:27px;
  animation:tp-point-compass .72s cubic-bezier(.3,.8,.2,1) both;
}

.tp-point-celebration__copy{
  min-width:0;
  flex:1;
}

.tp-point-celebration__eyebrow{
  display:flex;
  align-items:center;
  gap:5px;
  margin-bottom:2px;
  color:#d7dce1;
  font-size:8px;
  font-weight:900;
  letter-spacing:.16em;
  text-transform:uppercase;
}

.tp-point-celebration__eyebrow svg{
  width:12px;
  height:12px;
}

.tp-point-celebration__copy h3{
  margin:0;
  font-size:16px;
  line-height:1.12;
  letter-spacing:-.025em;
}

.tp-point-celebration__points{
  margin-top:3px;
  font-size:29px;
  line-height:1;
  font-weight:950;
  letter-spacing:-.055em;
}

.tp-point-celebration__points small{
  margin-left:5px;
  color:#d2d7dc;
  font-size:10px;
  font-weight:850;
  letter-spacing:.05em;
}

.tp-point-celebration__progress{
  position:relative;
  margin-top:14px;
  padding-top:11px;
  border-top:1px solid rgba(255,255,255,.13);
}

.tp-point-celebration__progress-row{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  color:#c5cbd1;
  font-size:9px;
}

.tp-point-celebration__progress-row strong{
  color:#fff;
  font-size:9px;
  white-space:nowrap;
}

.tp-point-celebration__track{
  height:6px;
  margin-top:8px;
  overflow:hidden;
  border-radius:999px;
  background:rgba(255,255,255,.12);
}

.tp-point-celebration__track i{
  display:block;
  height:100%;
  border-radius:inherit;
  background:#fff;
  transform-origin:left center;
  animation:tp-point-progress .85s .2s cubic-bezier(.2,.75,.2,1) both;
}

.tp-point-celebration__milestone{
  position:relative;
  margin-top:13px;
  padding:11px 12px;
  border-radius:14px;
  background:#fff;
  color:#111418;
  text-align:center;
}

.tp-point-celebration__milestone small{
  display:block;
  font-size:7px;
  font-weight:900;
  letter-spacing:.14em;
}

.tp-point-celebration__milestone strong{
  display:block;
  margin-top:2px;
  font-size:13px;
}

.tp-point-celebration__particle{
  position:absolute;
  left:50%;
  top:50%;
  width:5px;
  height:5px;
  border-radius:999px;
  background:#fff;
  opacity:0;
  animation:tp-point-particle 1.1s ease-out both;
}

.tp-point-celebration__particle:nth-of-type(1){--x:-115px;--y:-70px;animation-delay:.02s}
.tp-point-celebration__particle:nth-of-type(2){--x:106px;--y:-82px;animation-delay:.08s}
.tp-point-celebration__particle:nth-of-type(3){--x:-132px;--y:16px;animation-delay:.13s}
.tp-point-celebration__particle:nth-of-type(4){--x:128px;--y:22px;animation-delay:.17s}
.tp-point-celebration__particle:nth-of-type(5){--x:-82px;--y:88px;animation-delay:.22s}
.tp-point-celebration__particle:nth-of-type(6){--x:94px;--y:92px;animation-delay:.27s}

@keyframes tp-point-card{
  0%{opacity:0;transform:translateY(18px) scale(.84)}
  12%{opacity:1;transform:translateY(0) scale(1.035)}
  20%,82%{opacity:1;transform:translateY(0) scale(1)}
  100%{opacity:0;transform:translateY(-10px) scale(.97)}
}

@keyframes tp-point-wash{
  0%{opacity:0}
  15%{opacity:1}
  100%{opacity:0}
}

@keyframes tp-point-ring{
  0%{opacity:.8;transform:scale(.72)}
  100%{opacity:0;transform:scale(1.38)}
}

@keyframes tp-point-compass{
  0%{transform:rotate(-70deg) scale(.7)}
  70%{transform:rotate(12deg) scale(1.05)}
  100%{transform:rotate(0) scale(1)}
}

@keyframes tp-point-shine{
  0%{transform:translateX(0) rotate(18deg);opacity:0}
  25%{opacity:1}
  100%{transform:translateX(520%) rotate(18deg);opacity:0}
}

@keyframes tp-point-particle{
  0%{opacity:0;transform:translate(-50%,-50%) scale(.4)}
  20%{opacity:.9}
  100%{opacity:0;transform:translate(calc(-50% + var(--x)),calc(-50% + var(--y))) scale(1.3)}
}

@keyframes tp-point-progress{
  from{transform:scaleX(.25)}
  to{transform:scaleX(1)}
}

@media (prefers-reduced-motion:reduce){
  .tp-point-celebration *,
  .tp-point-celebration *::before,
  .tp-point-celebration *::after{
    animation-duration:.01ms !important;
    animation-iteration-count:1 !important;
  }
}
`;

export default function PusulaPointsCelebration() {
  const gamification = useGamificationStore();
  const award = gamification.lastAward;

  const unlockedField = useMemo(() => {
    if (!award) return null;
    const previous = Math.max(0, gamification.points - award.points);
    const before = getUnlockedFieldCount(previous);
    const after = getUnlockedFieldCount(gamification.points);
    return after > before && after <= 3 ? after : null;
  }, [award, gamification.points]);

  useEffect(() => {
    if (!award) return;

    const timeout = window.setTimeout(
      () => clearLastAward(),
      unlockedField ? 3200 : 2450,
    );

    return () => window.clearTimeout(timeout);
  }, [award?.id, unlockedField]);

  if (!award || typeof document === 'undefined') return null;

  const nextLabel = gamification.nextFieldNumber
    ? `${gamification.nextFieldNumber}. tarla için ${gamification.remainingToNext.toLocaleString('tr-TR')} P kaldı`
    : 'Tarla puan hedefleri tamamlandı';

  return createPortal(
    <>
      <style>{CSS}</style>
      <section
        className="tp-point-celebration"
        aria-live="polite"
        aria-label={`+${award.points} Pusula kazandın`}
      >
        <div className="tp-point-celebration__wash" />
        <div className={`tp-point-celebration__card${unlockedField ? ' is-milestone' : ''}`}>
          <span className="tp-point-celebration__shine" aria-hidden="true" />
          <i className="tp-point-celebration__particle" aria-hidden="true" />
          <i className="tp-point-celebration__particle" aria-hidden="true" />
          <i className="tp-point-celebration__particle" aria-hidden="true" />
          <i className="tp-point-celebration__particle" aria-hidden="true" />
          <i className="tp-point-celebration__particle" aria-hidden="true" />
          <i className="tp-point-celebration__particle" aria-hidden="true" />

          <div className="tp-point-celebration__top">
            <span className="tp-point-celebration__logo" aria-hidden="true">
              <Compass />
            </span>

            <div className="tp-point-celebration__copy">
              <div className="tp-point-celebration__eyebrow">
                <Sparkles />
                PUSULA PUANI
              </div>
              <h3>{award.title}</h3>
              <div className="tp-point-celebration__points">
                +{award.points.toLocaleString('tr-TR')}
                <small>PUSULA</small>
              </div>
            </div>
          </div>

          {unlockedField ? (
            <div className="tp-point-celebration__milestone">
              <small>YENİ HAK AÇILDI</small>
              <strong>{unlockedField}. tarla hakkın artık açık</strong>
            </div>
          ) : (
            <div className="tp-point-celebration__progress">
              <div className="tp-point-celebration__progress-row">
                <span>{nextLabel}</span>
                <strong>{gamification.points.toLocaleString('tr-TR')} P</strong>
              </div>
              <div className="tp-point-celebration__track" aria-hidden="true">
                <i style={{ width: `${gamification.progressPercent}%` }} />
              </div>
            </div>
          )}
        </div>
      </section>
    </>,
    document.body,
  );
}
