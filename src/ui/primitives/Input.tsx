import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
} from 'react';
import '../ui.css';

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
  error?: string;
};

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, id, className, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? `tp-input-${generatedId}`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [props['aria-describedby'], hintId, errorId]
    .filter(Boolean)
    .join(' ') || undefined;

  return (
    <label className="tp-ui-field" htmlFor={inputId}>
      {label ? <span className="tp-ui-field__label">{label}</span> : null}
      <input
        ref={ref}
        {...props}
        id={inputId}
        className={['tp-ui-input', className].filter(Boolean).join(' ')}
        aria-invalid={error ? true : props['aria-invalid']}
        aria-describedby={describedBy}
      />
      {hint ? (
        <span id={hintId} className="tp-ui-field__hint">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={errorId} className="tp-ui-field__error" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
});

export default Input;
