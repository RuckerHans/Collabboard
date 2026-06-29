'use client';

import { Eye, EyeOff } from 'lucide-react';
import { forwardRef, useState, type InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: string;
  error?: string;
};

export const PasswordField = forwardRef<HTMLInputElement, Props>(function PasswordField(
  { label, error, className = '', id, ...inputProps },
  ref,
) {
  const [visible, setVisible] = useState(false);
  const inputId = id ?? inputProps.name ?? 'password';
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div>
      <label htmlFor={inputId} className="block text-sm font-medium">
        {label}
      </label>
      <div className="relative mt-2">
        <input
          {...inputProps}
          ref={ref}
          id={inputId}
          type={visible ? 'text' : 'password'}
          aria-invalid={Boolean(error)}
          aria-describedby={errorId}
          className={`w-full rounded-md border border-line px-3 py-2 pr-11 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-50 ${className}`}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-md text-muted transition hover:bg-slate-50 hover:text-ink focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-500"
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {error && <p id={errorId} className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
});

PasswordField.displayName = 'PasswordField';
