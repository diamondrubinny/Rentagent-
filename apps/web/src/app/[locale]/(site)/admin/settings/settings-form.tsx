'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useState, useTransition } from 'react';
import { FormMessage, SubmitButton, TextField } from '@/components/forms';
import { updateGeneralSettings } from './actions';

interface SettingsFormProps {
  siteName: string;
  registrationMode: string;
  smtpEnabled: boolean;
}

export function SettingsForm({ siteName, registrationMode, smtpEnabled }: SettingsFormProps) {
  const t = useTranslations('Admin.settings');
  const tErrors = useTranslations('Admin.errors');
  const tValidation = useTranslations('Validation');
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string }>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updateGeneralSettings({
        siteName: String(form.get('siteName') ?? ''),
        registrationMode: String(form.get('registrationMode') ?? 'closed'),
      });
      setFieldErrors(('fieldErrors' in result && result.fieldErrors) || {});
      setMessage(
        result.ok
          ? { tone: 'success', text: t('saved') }
          : { tone: 'error', text: tErrors(result.error) },
      );
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
      <TextField
        name="siteName"
        label={t('siteName')}
        defaultValue={siteName}
        maxLength={80}
        dir="auto"
        required
        error={fieldErrors.siteName ? tValidation(fieldErrors.siteName) : undefined}
      />
      <fieldset className="space-y-3">
        <legend className="mb-1 font-semibold">{t('registration')}</legend>
        {!smtpEnabled && <p className="text-sm text-muted">{t('smtpRequired')}</p>}
        <label className="flex items-start gap-3">
          <input
            type="radio"
            name="registrationMode"
            value="open"
            defaultChecked={registrationMode === 'open'}
            disabled={!smtpEnabled}
            className="mt-1 size-5"
          />
          <span>
            <span className="block font-semibold">{t('open')}</span>
            <span className="block text-sm text-muted">{t('openHint')}</span>
          </span>
        </label>
        <label className="flex items-start gap-3">
          <input
            type="radio"
            name="registrationMode"
            value="closed"
            defaultChecked={registrationMode !== 'open'}
            className="mt-1 size-5"
          />
          <span>
            <span className="block font-semibold">{t('closed')}</span>
            <span className="block text-sm text-muted">{t('closedHint')}</span>
          </span>
        </label>
      </fieldset>
      <SubmitButton pending={pending} pendingLabel={t('saving')}>
        {t('save')}
      </SubmitButton>
    </form>
  );
}
