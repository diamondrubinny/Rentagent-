'use client';

import type { AgentInputField } from '@rentagent/shared';
import { useTranslations } from 'next-intl';
import { TextField } from '@/components/forms';

/** Renders an agent's task form fields (staff preview and end-user start form). */
export function TaskFields({
  fields,
  errors,
}: {
  fields: AgentInputField[];
  errors: Record<string, string>;
}) {
  const tValidation = useTranslations('Validation');
  const error = (key: string) =>
    errors[key]
      ? tValidation.has(errors[key])
        ? tValidation(errors[key])
        : errors[key]
      : undefined;
  return (
    <>
      {fields.map((field) => {
        const label = `${field.label}${field.required ? ' *' : ''}`;
        if (field.type === 'textarea' || field.type === 'select') {
          const id = `task-${field.key}`;
          const errorId = `${id}-error`;
          return (
            <div key={field.key}>
              <label htmlFor={id} className="mb-1 block font-semibold" dir="auto">
                {label}
              </label>
              {field.type === 'textarea' ? (
                <textarea
                  id={id}
                  name={field.key}
                  rows={6}
                  required={field.required}
                  dir="auto"
                  className="field-input py-2"
                  aria-invalid={Boolean(error(field.key))}
                  aria-describedby={error(field.key) ? errorId : undefined}
                />
              ) : (
                <select
                  id={id}
                  name={field.key}
                  required={field.required}
                  className="field-input"
                  aria-invalid={Boolean(error(field.key))}
                  aria-describedby={error(field.key) ? errorId : undefined}
                >
                  {!field.required && <option value="" />}
                  {field.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              )}
              {error(field.key) && (
                <p id={errorId} className="mt-1 text-sm font-semibold text-danger">
                  {error(field.key)}
                </p>
              )}
            </div>
          );
        }
        return (
          <TextField
            key={field.key}
            name={field.key}
            label={label}
            type={field.type === 'number' ? 'text' : field.type}
            inputMode={field.type === 'number' ? 'decimal' : undefined}
            required={field.required}
            dir={field.type === 'text' ? 'auto' : 'ltr'}
            error={error(field.key)}
          />
        );
      })}
    </>
  );
}
