import type { HTMLAttributes, ReactNode } from 'react';
import '../ui.css';

type Gap = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8;
type Align = 'start' | 'center' | 'end' | 'stretch';
type Justify = 'start' | 'center' | 'end' | 'between';

export type StackProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  direction?: 'column' | 'row';
  gap?: Gap;
  align?: Align;
  justify?: Justify;
  wrap?: boolean;
};

export default function Stack({
  children,
  direction = 'column',
  gap = 3,
  align = 'stretch',
  justify = 'start',
  wrap = false,
  className,
  ...props
}: StackProps) {
  return (
    <div
      className={[
        'tp-ui-stack',
        direction === 'row' && 'tp-ui-stack--row',
        wrap && 'tp-ui-stack--wrap',
        `tp-ui-stack--gap-${gap}`,
        `tp-ui-stack--align-${align}`,
        `tp-ui-stack--justify-${justify}`,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {children}
    </div>
  );
}
