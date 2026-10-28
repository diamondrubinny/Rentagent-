'use client';

import { useTranslations } from 'next-intl';
import type { FormEvent } from 'react';
import { FormMessage, SubmitButton, TextField } from '@/components/forms';
import { useAction } from '@/components/use-action';
import { translateAgentNow, updateAgentMeta } from '../actions';

interface MetaFormProps {
  agentId: string;
  categories: string[];
  locales: { code: string; name: string }[];
  values: {
    slug: string;
    name: string;
    category: string;
    description: string;
    localizations: Record<string, { name: string; description: string; auto?: boolean }>;
  };
}

export function MetaForm({ agentId, categories, locales, values }: MetaFormProps) {
  const t = useTranslations('AdminAgents.meta');
  const tCategories = useTranslations('AdminAgents.categories');
  const tErrors = useTranslations('AdminAgents.errors');
  const tValidation = useTranslations('Validation');
  const { pending, outcome, run, fieldErrors } = useAction();
  const error = (name: string) => (fieldErrors[name] ? tValidation(fieldErrors[name]) : undefined);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const get = (name: string) => String(form.get(name) ?? '');
    const localizations = Object.fromEntries(
      locales
        .map(({ code }) => {
          const name = get(`name_${code}`).trim();
          const description = get(`description_${code}`).trim();
          const previous = values.localizations[code];
          // Unchanged machine translations stay flagged for review; any edit counts as reviewed.
          const auto =
            previous?.auto === true &&
            previous.name === name &&
            previous.description === description;
          return [code, auto ? { name, description, auto } : { name, description }] as const;
        })
        .filter(([, value]) => value.name || value.description),
    );
    run(() =>
      updateAgentMeta(agentId, {
        slug: get('slug'),
        name: get('name'),
        category: get('category'),
        description: get('description'),
        localizations,
      }),
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-5" noValidate>
      {outcome?.ok && <FormMessage tone="success">{t('saved')}</FormMessage>}
      {outcome && !outcome.ok && <FormMessage tone="error">{tErrors(outcome.error)}</FormMessage>}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="name"
          label={t('name')}
          defaultValue={values.name}
          dir="auto"
          required
          error={error('name')}
        />
        <TextField
          name="slug"
          label={t('slug')}
          hint={t('slugHint')}
          defaultValue={values.slug}
          dir="ltr"
          required
          error={error('slug')}
        />
      </div>
      <div>
        <label htmlFor="agent-category" className="mb-1 block font-semibold">
          {t('category')}
        </label>
        <select
          id="agent-category"
          name="category"
          defaultValue={values.category}
          className="field-input"
        >
          {categories.map((category) => (
            <option key={category} value={category}>
              {tCategories(category)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="agent-description" className="mb-1 block font-semibold">
          {t('description')}
        </label>
        <textarea
          id="agent-description"
          name="description"
          rows={3}
          maxLength={2000}
          defaultValue={values.description}
          dir="auto"
          className="field-input py-2"
        />
      </div>
      <details className="rounded-lg border border-border">
        <summary className="cursor-pointer p-3 font-semibold">{t('translations')}</summary>
        <div className="space-y-4 p-4">
          <p className="text-sm text-muted">{t('translationsHint')}</p>
          <TranslateAgentButton agentId={agentId} />
          {locales.map(({ code, name }) => (
            <fieldset key={code} className="space-y-3">
              <legend className="font-semibold">
                <span lang={code}>{name}</span>
                {values.localizations[code]?.auto && (
                  <span className="ms-2 text-sm font-normal text-danger">
                    {t('autoTranslated')}
                  </span>
                )}
              </legend>
              <TextField
                name={`name_${code}`}
                label={t('localName')}
                defaultValue={values.localizations[code]?.name ?? ''}
                lang={code}
                dir="auto"
              />
              <div>
                <label htmlFor={`description_${code}`} className="mb-1 block text-sm font-semibold">
                  {t('localDescription')}
                </label>
                <textarea
                  id={`description_${code}`}
                  name={`description_${code}`}
                  rows={2}
                  maxLength={2000}
                  defaultValue={values.localizations[code]?.description ?? ''}
                  lang={code}
                  dir="auto"
                  className="field-input py-2"
                />
              </div>
            </fieldset>
          ))}
        </div>
      </details>
      <SubmitButton pending={pending} pendingLabel={t('saving')}>
        {t('save')}
      </SubmitButton>
    </form>
  );
}

function TranslateAgentButton({ agentId }: { agentId: string }) {
  const t = useTranslations('AdminAgents.meta');
  const tErrors = useTranslations('AdminAgents.errors');
  const { pending, outcome, run } = useAction();
  return (
    <div className="space-y-2">
      <button
        type="button"
        className="btn btn-secondary"
        disabled={pending}
        onClick={() => run(() => translateAgentNow(agentId))}
      >
        {t('autoTranslate')}
      </button>
      {outcome?.ok && (
        <p role="status" className="text-sm">
          {outcome.values?.queued
            ? t('autoTranslateQueued', { count: outcome.values.queued })
            : t('autoTranslateNothing')}
        </p>
      )}
      {outcome && !outcome.ok && <FormMessage tone="error">{tErrors(outcome.error)}</FormMessage>}
    </div>
  );
}
