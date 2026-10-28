'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { FormMessage, SubmitButton, TextField } from '@/components/forms';
import { useAction } from '@/components/use-action';
import { addKey, deleteKey, testKey, updateKey } from '../actions';

interface KeyView {
  id: string;
  label: string;
  last4: string;
  enabled: boolean;
  monthlyLimit: string;
  spentThisMonth: string;
  lastUsed: string | null;
  lastErrorKind: string | null;
}

function KeyRow({ keyView }: { keyView: KeyView }) {
  const t = useTranslations('AdminAi.keys');
  const tErrors = useTranslations('AdminAi.errors');
  const tValidation = useTranslations('Validation');
  const { pending, outcome, run, fieldErrors } = useAction();
  const [confirmDelete, setConfirmDelete] = useState(false);

  function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(() =>
      updateKey(keyView.id, {
        label: String(form.get('label') ?? ''),
        monthlyLimit: String(form.get('monthlyLimit') ?? ''),
        enabled: form.get('enabled') === 'on',
      }),
    );
  }

  let message: string | null = null;
  if (outcome?.ok)
    message = outcome.message ? t(outcome.message, outcome.values ?? {}) : t('saved');
  return (
    <li className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p>
          <span className="font-semibold" dir="auto">
            {keyView.label}
          </span>{' '}
          <span className="font-mono text-muted" dir="ltr">
            {keyView.last4 ? `••••${keyView.last4}` : t('noKey')}
          </span>
        </p>
        <p className="text-sm text-muted">
          {t('spent', { amount: keyView.spentThisMonth })}
          {keyView.lastUsed ? ` · ${t('lastUsed', { date: keyView.lastUsed })}` : ''}
        </p>
      </div>
      {keyView.lastErrorKind && (
        <p className="text-sm font-semibold text-danger">
          {t('lastError', { kind: tErrors(`ai_${keyView.lastErrorKind}`) })}
        </p>
      )}
      {message && <FormMessage tone="success">{message}</FormMessage>}
      {outcome && !outcome.ok && <FormMessage tone="error">{tErrors(outcome.error)}</FormMessage>}
      <form
        onSubmit={onSave}
        className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        noValidate
      >
        <TextField
          name="label"
          label={t('label')}
          defaultValue={keyView.label}
          dir="auto"
          required
          error={fieldErrors.label ? tValidation(fieldErrors.label) : undefined}
        />
        <TextField
          name="monthlyLimit"
          label={t('monthlyLimit')}
          inputMode="decimal"
          defaultValue={keyView.monthlyLimit}
          dir="ltr"
          error={fieldErrors.monthlyLimit ? tValidation(fieldErrors.monthlyLimit) : undefined}
        />
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={keyView.enabled}
            className="size-5"
          />
          {t('enabled')}
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-3">
          <SubmitButton pending={pending} pendingLabel={t('working')} className="btn btn-secondary">
            {t('save')}
          </SubmitButton>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={pending}
            onClick={() => run(() => testKey(keyView.id))}
          >
            {t('test')}
          </button>
          {confirmDelete ? (
            <>
              <button
                type="button"
                className="btn bg-danger text-primary-fg"
                disabled={pending}
                onClick={() => run(() => deleteKey(keyView.id))}
              >
                {t('confirmDelete')}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setConfirmDelete(false)}
              >
                {t('cancel')}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setConfirmDelete(true)}
            >
              {t('delete')}
            </button>
          )}
        </div>
      </form>
    </li>
  );
}

export function KeysSection({
  providerId,
  credential,
  keys,
}: {
  providerId: string;
  credential: 'apiKey' | 'awsKeyPair' | 'optionalApiKey';
  keys: KeyView[];
}) {
  const t = useTranslations('AdminAi.keys');
  const tErrors = useTranslations('AdminAi.errors');
  const tValidation = useTranslations('Validation');
  const { pending, outcome, run, fieldErrors } = useAction();
  const [formKey, setFormKey] = useState(0);
  const error = (name: string) => (fieldErrors[name] ? tValidation(fieldErrors[name]) : undefined);

  function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = Object.fromEntries(
      [...new FormData(event.currentTarget).entries()].map(([key, value]) => [key, String(value)]),
    );
    // The secret is sent once and never comes back to the browser.
    run(
      () => addKey(providerId, input),
      () => setFormKey((value) => value + 1),
    );
  }

  return (
    <div className="mt-4 space-y-6">
      <p className="text-muted">{t('intro')}</p>
      {keys.length === 0 ? (
        <p>{t('empty')}</p>
      ) : (
        <ul className="space-y-4">
          {keys.map((keyView) => (
            <KeyRow key={keyView.id} keyView={keyView} />
          ))}
        </ul>
      )}
      <form
        key={formKey}
        onSubmit={onAdd}
        className="space-y-4 rounded-lg border border-border bg-surface p-4"
        noValidate
      >
        <h3 className="text-lg font-bold">{t('addTitle')}</h3>
        {outcome && !outcome.ok && <FormMessage tone="error">{tErrors(outcome.error)}</FormMessage>}
        {outcome?.ok && <FormMessage tone="success">{t('added')}</FormMessage>}
        <TextField
          name="label"
          label={t('label')}
          defaultValue={t('defaultLabel')}
          dir="auto"
          required
          error={error('label')}
        />
        {credential === 'awsKeyPair' ? (
          <>
            <TextField
              name="awsAccessKeyId"
              label={t('awsAccessKeyId')}
              autoComplete="off"
              spellCheck={false}
              dir="ltr"
              required
              error={error('awsAccessKeyId')}
            />
            <TextField
              name="awsSecretAccessKey"
              type="password"
              label={t('awsSecretAccessKey')}
              autoComplete="new-password"
              dir="ltr"
              required
              error={error('awsSecretAccessKey')}
            />
          </>
        ) : (
          <TextField
            name="apiKey"
            type="password"
            label={credential === 'optionalApiKey' ? t('apiKeyOptional') : t('apiKey')}
            hint={t('apiKeyHint')}
            autoComplete="new-password"
            spellCheck={false}
            dir="ltr"
            required={credential === 'apiKey'}
            error={error('apiKey')}
          />
        )}
        <TextField
          name="monthlyLimit"
          label={t('monthlyLimit')}
          hint={t('monthlyLimitHint')}
          inputMode="decimal"
          dir="ltr"
          error={error('monthlyLimit')}
        />
        <SubmitButton pending={pending} pendingLabel={t('working')}>
          {t('add')}
        </SubmitButton>
      </form>
    </div>
  );
}
