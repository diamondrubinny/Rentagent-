'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useState, useTransition } from 'react';
import { FormMessage, SubmitButton, TextField } from '@/components/forms';
import { updateUsageSettings } from './actions';

export function UsageSettingsForm({
  catalogPublic,
  userDailyRunLimit,
  runRetentionDays,
}: {
  catalogPublic: boolean;
  userDailyRunLimit: number;
  runRetentionDays: number;
}) {
  const t = useTranslations('Admin.usageSettings');
  const tErrors = useTranslations('Admin.errors');
  const tValidation = useTranslations('Validation');
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string }>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updateUsageSettings({
        catalogPublic: form.get('catalogPublic') === 'on',
        userDailyRunLimit: String(form.get('userDailyRunLimit') ?? ''),
        runRetentionDays: String(form.get('runRetentionDays') ?? ''),
      });
      setFieldErrors(('fieldErrors' in result && result.fieldErrors) || {});
      setMessage(
        result.ok
          ? { tone: 'success', text: t('saved') }
          : { tone: 'error', text: tErrors(result.error) },
      );
    });
  }

  const error = (name: string) => (fieldErrors[name] ? tValidation(fieldErrors[name]) : undefined);
  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="catalogPublic"
          defaultChecked={catalogPublic}
          className="mt-1 size-5"
        />
        <span>
          <span className="block font-semibold">{t('catalogPublic')}</span>
          <span className="block text-sm text-muted">{t('catalogPublicHint')}</span>
        </span>
      </label>
      <TextField
        name="userDailyRunLimit"
        label={t('dailyLimit')}
        hint={t('dailyLimitHint')}
        inputMode="numeric"
        dir="ltr"
        defaultValue={String(userDailyRunLimit)}
        error={error('userDailyRunLimit')}
      />
      <TextField
        name="runRetentionDays"
        label={t('retention')}
        hint={t('retentionHint')}
        inputMode="numeric"
        dir="ltr"
        defaultValue={String(runRetentionDays)}
        error={error('runRetentionDays')}
      />
      <SubmitButton pending={pending} pendingLabel={t('saving')}>
        {t('save')}
      </SubmitButton>
    </form>
  );
}
