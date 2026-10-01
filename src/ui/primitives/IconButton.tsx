import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import '../ui.css';

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  icon: ReactNode;
};

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton({ label, icon, className, type = 'button', ...props }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        className={['tp-ui-icon-button', className].filter(Boolean).join(' ')}
        aria-label={label}
        title={props.title ?? label}
        {...props}
      >
        {icon}
      </button>
    );
  },
);

export default IconButton;
