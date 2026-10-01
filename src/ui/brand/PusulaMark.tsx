import type { CSSProperties } from 'react';
import './PusulaMark.css';

const PUSULA_BODY_SRC =
  'https://xwyfidtktauxivsosmex.supabase.co/storage/v1/object/public/pusula/compass-body.webp';
const PUSULA_NEEDLE_SRC =
  'https://xwyfidtktauxivsosmex.supabase.co/storage/v1/object/public/pusula/compass-needle-centered.webp';

export type PusulaMarkProps = {
  size?: number;
  animated?: boolean;
  className?: string;
  label?: string;
};

export default function PusulaMark({
  size = 56,
  animated = false,
  className,
  label = 'TarlaPusula',
}: PusulaMarkProps) {
  const style = { '--tp-pusula-size': `${size}px` } as CSSProperties;

  return (
    <span
      className={[
        'tp-ui-pusula-mark',
        animated && 'tp-ui-pusula-mark--animated',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
      role="img"
      aria-label={label}
    >
      <img
        className="tp-ui-pusula-mark__body"
        src={PUSULA_BODY_SRC}
        alt=""
        draggable={false}
      />

      <img
        className="tp-ui-pusula-mark__needle"
        src={PUSULA_NEEDLE_SRC}
        alt=""
        draggable={false}
      />
    </span>
  );
}
