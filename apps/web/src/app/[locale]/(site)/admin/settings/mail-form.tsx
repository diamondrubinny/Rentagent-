'use client';

import { SMTP_SECURITY } from '@rentagent/shared';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState, useTransition } from 'react';
import { FormMessage, SubmitButton, TextField } from '@/components/forms';
import { updateMailSettings } from './actions';

export interface MailSettingsValues {
  enabled: boolean;
  host: string;
  port: number;
  security: (typeof SMTP_SECURITY)[number];
  user: string;
  hasPassword: boolean;
  fromEmail: string;
  fromName: string;
}

const SECURITY_LABELS = {
  tls: 'smtpSecurityTls',
  starttls: 'smtpSecurityStarttls',
  none: 'smtpSecurityNone',
} as const;

export function MailSettingsForm({ values }: { values: MailSettingsValues }) {
  const t = useTranslations('Admin.mailSettings');
  const tSetup = useTranslations('Setup');
  const tErrors = useTranslations('Admin.errors');
  const tValidation = useTranslations('Validation');
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string }>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const field = (name: string) => String(form.get(name) ?? '');
    startTransition(async () => {
      const result = await updateMailSettings({
        enabled: form.get('enabled') === 'on',
        host: field('host'),
        port: field('port'),
        security: field('security'),
        user: field('user'),
        password: field('password'),
        fromEmail: field('fromEmail'),
        fromName: field('fromName'),
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
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={values.enabled}
          className="mt-1 size-5"
        />
        <span>
          <span className="block font-semibold">{t('enabled')}</span>
          <span className="block text-sm text-muted">{tSetup('mailIntro')}</span>
        </span>
      </label>
      <TextField
        name="host"
        label={t('host')}
        defaultValue={values.host}
        dir="ltr"
        autoComplete="off"
        error={error('host')}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="port"
          label={tSetup('smtpPort')}
          type="number"
          min={1}
          max={65535}
          defaultValue={String(values.port)}
          dir="ltr"
          error={error('port')}
        />
        <div>
          <label htmlFor="mail-security" className="mb-1 block font-semibold">
            {tSetup('smtpSecurity')}
          </label>
          <select
            id="mail-security"
            name="security"
            defaultValue={values.security}
            className="field-input"
          >
            {SMTP_SECURITY.map((option) => (
              <option key={option} value={option}>
                {tSetup(SECURITY_LABELS[option])}
              </option>
            ))}
          </select>
        </div>
      </div>
      <TextField
        name="user"
        label={tSetup('smtpUser')}
        defaultValue={values.user}
        dir="ltr"
        autoComplete="off"
        error={error('user')}
      />
      <TextField
        name="password"
        label={tSetup('smtpPassword')}
        type="password"
        autoComplete="new-password"
        hint={values.hasPassword ? t('passwordKeep') : tSetup('smtpPasswordHint')}
        error={error('password')}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="fromEmail"
          label={t('fromEmail')}
          type="email"
          defaultValue={values.fromEmail}
          dir="ltr"
          error={error('fromEmail')}
        />
        <TextField
          name="fromName"
          label={tSetup('smtpFromName')}
          defaultValue={values.fromName}
          error={error('fromName')}
        />
      </div>
      <p className="text-sm text-muted">{t('testHint')}</p>
      <SubmitButton pending={pending} pendingLabel={t('saving')}>
        {t('save')}
      </SubmitButton>
    </form>
  );
}
