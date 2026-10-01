import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import PusulaLoader from './PusulaLoader';
import './PusulaLoadingOverlay.css';

type PusulaLoadingOverlayProps = {
  open: boolean;
  label?: string;
  hint?: string;
};

export default function PusulaLoadingOverlay({
  open,
  label = 'İşleniyor…',
  hint,
}: PusulaLoadingOverlayProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      if (!dialog.open) {
        try {
          dialog.showModal();
        } catch {
          dialog.setAttribute('open', '');
        }
      }
      return;
    }

    if (dialog.open) dialog.close();
  }, [open]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <dialog
      ref={dialogRef}
      className="tp-pusula-loading-dialog"
      aria-label={label}
      aria-live="polite"
      onCancel={(event) => event.preventDefault()}
      onClick={(event) => event.preventDefault()}
    >
      <section className="tp-pusula-loading-window" role="status">
        <div className="tp-pusula-loading-window-glow" aria-hidden="true" />
        <PusulaLoader size="lg" centered label={label} hint={hint} />
      </section>
    </dialog>,
    document.body,
  );
}
