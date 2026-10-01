import type { HTMLAttributes, ReactNode } from 'react';
import '../ui.css';

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  tone?: 'default' | 'subtle';
  flat?: boolean;
  interactive?: boolean;
  children: ReactNode;
};

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export default function Card({
  tone = 'default',
  flat = false,
  interactive = false,
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={joinClasses(
        'tp-ui-card',
        tone === 'subtle' && 'tp-ui-card--subtle',
        flat && 'tp-ui-card--flat',
        interactive && 'tp-ui-card--interactive',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
