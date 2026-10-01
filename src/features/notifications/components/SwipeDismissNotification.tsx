import { useRef, useState, type ReactNode, type TouchEvent } from 'react';
import { Trash2 } from 'lucide-react';
import './SwipeDismissNotification.css';

type Props = {
  notificationId: string;
  onDismiss: (id: string) => void;
  children: ReactNode;
  className?: string;
};

const DISMISS_THRESHOLD = 58;
const MAX_DRAG = 104;

export default function SwipeDismissNotification({
  notificationId,
  onDismiss,
  children,
  className = '',
}: Props) {
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const horizontalRef = useRef(false);
  const [offset, setOffset] = useState(0);
  const [dismissing, setDismissing] = useState(false);

  const dismiss = () => {
    if (dismissing) return;
    setDismissing(true);
    setOffset(-MAX_DRAG);
    window.setTimeout(() => onDismiss(notificationId), 150);
  };

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    startRef.current = { x: touch.clientX, y: touch.clientY };
    horizontalRef.current = false;
  };

  const onTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    const start = startRef.current;
    const touch = event.touches[0];
    if (!start || !touch || dismissing) return;

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;

    if (!horizontalRef.current && Math.abs(dx) > 7) {
      horizontalRef.current = Math.abs(dx) > Math.abs(dy);
    }
    if (!horizontalRef.current) return;

    const next = Math.max(-MAX_DRAG, Math.min(0, dx));
    setOffset(next);
  };

  const onTouchEnd = () => {
    startRef.current = null;
    horizontalRef.current = false;
    if (offset <= -DISMISS_THRESHOLD) {
      dismiss();
      return;
    }
    setOffset(0);
  };

  return (
    <div
      className={`tp-notification-swipe ${className}${dismissing ? ' is-dismissing' : ''}`}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={() => setOffset(0)}
    >
      <button
        type="button"
        className="tp-notification-swipe-dismiss"
        onClick={dismiss}
        aria-label="Bildirimi bu ekrandan gizle"
        title="Bildirimi gizle"
      >
        <Trash2 size={17} aria-hidden="true" />
        <span>Gizle</span>
      </button>
      <div
        className="tp-notification-swipe-content"
        style={{ transform: `translateX(${offset}px)` }}
      >
        {children}
      </div>
    </div>
  );
}
