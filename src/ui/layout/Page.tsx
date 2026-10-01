import type { HTMLAttributes, ReactNode } from 'react';
import '../ui.css';

export type PageProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  contained?: boolean;
};

export default function Page({
  children,
  contained = true,
  className,
  ...props
}: PageProps) {
  return (
    <main
      className={['tp-ui-page', className].filter(Boolean).join(' ')}
      {...props}
    >
      {contained ? <div className="tp-ui-page__inner">{children}</div> : children}
    </main>
  );
}
