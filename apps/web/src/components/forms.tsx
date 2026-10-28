'use client';

import { type InputHTMLAttributes, type ReactNode, useEffect, useId, useRef } from 'react';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  name: string;
  label: string;
  hint?: ReactNode;
  error?: string;
}

/** Labelled input with hint and error wired through aria-describedby. */
export function TextField({ name, label, hint, error, id, ...inputProps }: TextFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? `${name}-${generatedId}`;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  return (
    <div>
      <label htmlFor={fieldId} className="mb-1 block font-semibold">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="mb-1 text-sm text-muted">
          {hint}
        </p>
      )}
      <input
        id={fieldId}
        name={name}
        aria-invalid={Boolean(error)}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        className="field-input"
        {...inputProps}
      />
      {error && (
        <p id={errorId} className="mt-1 text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Error or success message. Errors take focus so keyboard and screen-reader
 * users notice them; successes are announced politely.
 */
export function FormMessage({
  tone,
  children,
}: {
  tone: 'error' | 'success';
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (tone === 'error') ref.current?.focus();
  }, [tone, children]);
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role={tone === 'error' ? 'alert' : 'status'}
      className={
        tone === 'error'
          ? 'rounded-lg border-2 border-danger bg-danger-bg p-4'
          : 'rounded-lg border border-success bg-success-bg p-4 text-success'
      }
    >
      {children}
    </div>
  );
}

export function SubmitButton({
  pending,
  children,
  pendingLabel,
  className = 'btn btn-primary',
}: {
  pending: boolean;
  children: ReactNode;
  pendingLabel: string;
  className?: string;
}) {
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}

/** Field-level i18n keys from a Zod error, keeping the first message per field. */
export function zodFieldErrors(
  issues: { path: PropertyKey[]; message: string }[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? 'form');
    errors[field] ??= issue.message;
  }
  return errors;
}
