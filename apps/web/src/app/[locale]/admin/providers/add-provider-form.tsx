'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { FormMessage, SubmitButton, TextField } from '@/components/forms';
import { useAction } from '@/components/use-action';
import { useRouter } from '@/i18n/navigation';
import { createProvider } from './actions';

interface TypeOption {
  type: string;
  label: string;
  defaultBaseUrl: string;
  baseUrlRequired: boolean;
  settings: string[];
}

export function ProviderFields({
  option,
  values,
  fieldErrors,
}: {
  option: TypeOption;
  values?: Record<string, string>;
  fieldErrors: Record<string, string>;
}) {
  const t = useTranslations('AdminAi.providerForm');
  const tValidation = useTranslations('Validation');
  const error = (name: string) => (fieldErrors[name] ? tValidation(fieldErrors[name]) : undefined);
  return (
    <>
      <TextField
        name="name"
        label={t('name')}
        defaultValue={values?.name ?? option.label}
        dir="auto"
        required
        error={error('name')}
      />
      <TextField
        name="baseUrl"
        type="url"
        label={option.baseUrlRequired ? t('baseUrlRequired') : t('baseUrl')}
        hint={
          option.baseUrlRequired
            ? t('baseUrlHintCustom')
            : t('baseUrlHint', { url: option.defaultBaseUrl || '—' })
        }
        placeholder={option.defaultBaseUrl || 'http://ollama:11434/v1'}
        defaultValue={values?.baseUrl ?? ''}
        dir="ltr"
        required={option.baseUrlRequired}
        error={error('baseUrl')}
      />
      {option.settings.map((setting) => (
        <TextField
          key={setting}
          name={setting}
          label={t(setting)}
          hint={t(`${setting}Hint`)}
          defaultValue={values?.[setting] ?? ''}
          dir="ltr"
          error={error(setting)}
        />
      ))}
    </>
  );
}

export function AddProviderForm({ types }: { types: TypeOption[] }) {
  const t = useTranslations('AdminAi.providerForm');
  const tErrors = useTranslations('AdminAi.errors');
  const router = useRouter();
  const [type, setType] = useState(types[0]?.type ?? '');
  const option = types.find((candidate) => candidate.type === type) ?? types[0];
  const { pending, outcome, run, fieldErrors, reset } = useAction();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = Object.fromEntries(
      [...new FormData(event.currentTarget).entries()].map(([key, value]) => [key, String(value)]),
    );
    run(
      () => createProvider(type, input),
      (result) => router.push(`/admin/providers/${result.id}`),
    );
  }

  if (!option) return null;
  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-5" noValidate>
      {outcome && !outcome.ok && <FormMessage tone="error">{tErrors(outcome.error)}</FormMessage>}
      <div>
        <label htmlFor="provider-type" className="mb-1 block font-semibold">
          {t('type')}
        </label>
        <select
          id="provider-type"
          value={type}
          onChange={(event) => {
            setType(event.target.value);
            reset();
          }}
          className="field-input"
        >
          {types.map((candidate) => (
            <option key={candidate.type} value={candidate.type}>
              {candidate.label}
            </option>
          ))}
        </select>
      </div>
      <ProviderFields key={type} option={option} fieldErrors={fieldErrors} />
      <SubmitButton pending={pending} pendingLabel={t('saving')}>
        {t('create')}
      </SubmitButton>
    </form>
  );
}
