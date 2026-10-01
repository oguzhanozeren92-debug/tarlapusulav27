import { useEffect, useRef, useState } from 'react';
import PusulaLoadingOverlay from '../../../components/PusulaLoadingOverlay';

const MAP_LAYER_BUTTON_SELECTOR = [
  '.tp-map-first-shell .tp-mf-layer-option',
  '.tp-map-first-shell .tp-mf-sublayer-chip',
].join(',');

export default function HomeMapLayerLoadingBridge() {
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState('Harita yeni katmana geçiyor.');
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const clearCloseTimer = () => {
      if (closeTimerRef.current != null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };

    const handleLayerClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const button = target.closest<HTMLButtonElement>(MAP_LAYER_BUTTON_SELECTOR);
      if (!button || button.disabled || button.classList.contains('active')) return;

      const label =
        button.querySelector('strong')?.textContent?.trim() ||
        button.textContent?.replace(/\s+/g, ' ').trim() ||
        'Yeni katman';

      clearCloseTimer();
      setHint(`${label} hazırlanıyor.`);
      setOpen(true);

      /*
       * Bu, eski katman-geçiş geri bildirimidir; harita veri akışını bloke etmez.
       * Katman state'i aynı tıklamada değişir, loader yalnız geçişi görünür kılar.
       */
      closeTimerRef.current = window.setTimeout(() => {
        setOpen(false);
        closeTimerRef.current = null;
      }, 900);
    };

    document.addEventListener('click', handleLayerClick, true);
    return () => {
      document.removeEventListener('click', handleLayerClick, true);
      clearCloseTimer();
    };
  }, []);

  return (
    <PusulaLoadingOverlay
      open={open}
      label="Tarla katmanı hazırlanıyor…"
      hint={hint}
    />
  );
}
