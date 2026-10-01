import {
  forwardRef,
  useId,
  type SelectHTMLAttributes,
} from 'react';
import '../ui.css';

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  hint?: string;
  error?: string;
};

const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, id, className, children, ...props },
  ref,
) {
  const generatedId = useId();
  const selectId = id ?? `tp-select-${generatedId}`;
  const hintId = hint ? `${selectId}-hint` : undefined;
  const errorId = error ? `${selectId}-error` : undefined;
  const describedBy = [props['aria-describedby'], hintId, errorId]
    .filter(Boolean)
    .join(' ') || undefined;

  return (
    <label className="tp-ui-field" htmlFor={selectId}>
      {label ? <span className="tp-ui-field__label">{label}</span> : null}
      <select
        ref={ref}
        {...props}
        id={selectId}
        className={['tp-ui-select', className].filter(Boolean).join(' ')}
        aria-invalid={error ? true : props['aria-invalid']}
        aria-describedby={describedBy}
      >
        {children}
      </select>
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

export default Select;
