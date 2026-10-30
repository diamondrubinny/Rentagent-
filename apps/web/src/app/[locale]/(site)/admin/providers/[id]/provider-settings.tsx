'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { FormMessage, SubmitButton } from '@/components/forms';
import { useAction } from '@/components/use-action';
import { useRouter } from '@/i18n/navigation';
import { deleteProvider, updateProvider } from '../actions';
import { ProviderFields } from '../add-provider-form';

interface ProviderSettingsProps {
  providerId: string;
  enabled: boolean;
  option: {
    type: string;
    label: string;
    defaultBaseUrl: string;
    baseUrlRequired: boolean;
    settings: string[];
  };
  values: Record<string, string>;
}

export function ProviderSettings({ providerId, enabled, option, values }: ProviderSettingsProps) {
  const t = useTranslations('AdminAi.providerForm');
  const tErrors = useTranslations('AdminAi.errors');
  const router = useRouter();
  const { pending, outcome, run, fieldErrors } = useAction();
  const [confirmDelete, setConfirmDelete] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = Object.fromEntries(
      [...form.entries()].map(([key, value]) => [key, String(value)]),
    );
    run(() => updateProvider(providerId, input, form.get('enabled') === 'on'));
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-5" noValidate>
      {outcome &&
        (outcome.ok ? (
          <FormMessage tone="success">{t('saved')}</FormMessage>
        ) : (
          <FormMessage tone="error">{tErrors(outcome.error)}</FormMessage>
        ))}
      <ProviderFields option={option} values={values} fieldErrors={fieldErrors} />
      <label className="flex items-center gap-3">
        <input type="checkbox" name="enabled" defaultChecked={enabled} className="size-5" />
        {t('enabled')}
      </label>
      <div className="flex flex-wrap gap-2">
        <SubmitButton pending={pending} pendingLabel={t('saving')}>
          {t('save')}
        </SubmitButton>
        {confirmDelete ? (
          <>
            <button
              type="button"
              className="btn bg-danger text-primary-fg"
              disabled={pending}
              onClick={() =>
                run(
                  () => deleteProvider(providerId),
                  () => router.push('/admin/providers'),
                )
              }
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
  );
}
