'use client';

import type { AgentInputField } from '@rentagent/shared';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { FormMessage, SubmitButton, TextField } from '@/components/forms';
import { useAction } from '@/components/use-action';
import { useRouter } from '@/i18n/navigation';
import { startPreviewRun } from '../../actions';

interface PreviewFormProps {
  agentId: string;
  locale: string;
  draftFields: AgentInputField[];
  publishedFields: AgentInputField[] | null;
  publishedVersion: number | null;
}

/** Renders the agent's task form; shared with the end-user run form in phase 5. */
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

export function PreviewForm({
  agentId,
  locale,
  draftFields,
  publishedFields,
  publishedVersion,
}: PreviewFormProps) {
  const t = useTranslations('AdminAgents.preview');
  const tErrors = useTranslations('AdminAgents.errors');
  const router = useRouter();
  const [source, setSource] = useState<'draft' | 'published'>('draft');
  const { pending, outcome, run, fieldErrors } = useAction();
  const fields = source === 'draft' || !publishedFields ? draftFields : publishedFields;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = Object.fromEntries(
      [...new FormData(event.currentTarget).entries()]
        .filter(([key]) => !key.startsWith('__'))
        .map(([key, value]) => [key, String(value)]),
    );
    run(
      () => startPreviewRun(agentId, input, { useDraft: source === 'draft', locale }),
      (result) => router.push(`/admin/runs/${result.id}`),
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {outcome && !outcome.ok && <FormMessage tone="error">{tErrors(outcome.error)}</FormMessage>}
      <fieldset>
        <legend className="mb-2 font-semibold">{t('source')}</legend>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="__source"
              className="size-5"
              checked={source === 'draft'}
              onChange={() => setSource('draft')}
            />
            {t('draft')}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="__source"
              className="size-5"
              checked={source === 'published'}
              disabled={publishedVersion === null}
              onChange={() => setSource('published')}
            />
            {publishedVersion === null
              ? t('notPublished')
              : t('published', { version: publishedVersion })}
          </label>
        </div>
      </fieldset>
      <TaskFields key={source} fields={fields} errors={fieldErrors} />
      <SubmitButton pending={pending} pendingLabel={t('starting')}>
        {t('start')}
      </SubmitButton>
    </form>
  );
}
