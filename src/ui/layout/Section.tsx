import type { HTMLAttributes, ReactNode } from 'react';
import '../ui.css';

export type SectionProps = HTMLAttributes<HTMLElement> & {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
};

export default function Section({
  title,
  description,
  action,
  children,
  className,
  ...props
}: SectionProps) {
  const hasHeader = Boolean(title || description || action);

  return (
    <section
      className={['tp-ui-section', className].filter(Boolean).join(' ')}
      {...props}
    >
      {hasHeader ? (
        <header className="tp-ui-section__header">
          <div>
            {title ? <h2 className="tp-ui-section__title">{title}</h2> : null}
            {description ? (
              <p className="tp-ui-section__description">{description}</p>
            ) : null}
          </div>
          {action}
        </header>
      ) : null}
      {children}
    </section>
  );
}
