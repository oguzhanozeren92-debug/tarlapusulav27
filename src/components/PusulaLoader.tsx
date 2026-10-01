import './PusulaLoader.css';

type PusulaLoaderProps = {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  hint?: string;
  centered?: boolean;
  inline?: boolean;
  className?: string;
};

export default function PusulaLoader({
  size = 'md',
  label = 'İşleniyor…',
  hint,
  centered = false,
  inline = false,
  className = '',
}: PusulaLoaderProps) {
  return (
    <div
      className={[
        'tp-pusula-loader',
        `is-${size}`,
        centered ? 'is-centered' : '',
        inline ? 'is-inline' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      role="status"
      aria-live="polite"
    >
      <div className="tp-pusula-loader-visual" aria-hidden="true">
        <span className="tp-pusula-loader-ring tp-pusula-loader-ring-back" />
        <span className="tp-pusula-loader-ring tp-pusula-loader-ring-glow" />
        <span className="tp-pusula-loader-ring tp-pusula-loader-ring-front" />
        <span className="tp-pusula-loader-star" />
        <span className="tp-pusula-loader-needle" />
        <span className="tp-pusula-loader-core" />
      </div>

      <div className="tp-pusula-loader-copy">
        <strong>{label}</strong>
        {hint ? <small>{hint}</small> : null}
      </div>
    </div>
  );
}
