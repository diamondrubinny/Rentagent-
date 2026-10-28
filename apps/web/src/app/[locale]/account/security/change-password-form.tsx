'use client';

import { passwordField } from '@rentagent/shared';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { FormMessage, SubmitButton, TextField } from '@/components/forms';
import { authClient } from '@/lib/auth-client';
import { authErrorKey } from '@/lib/auth-errors';

export function ChangePasswordForm({ minLength }: { minLength: number }) {
  const t = useTranslations('Account.security.password');
  const tValidation = useTranslations('Validation');
  const tErrors = useTranslations('AuthErrors');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string }>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const currentPassword = String(form.get('currentPassword') ?? '');
    const newPassword = String(form.get('newPassword') ?? '');
    const errors: Record<string, string> = {};
    if (!currentPassword) errors.currentPassword = 'required';
    const check = passwordField.safeParse(newPassword);
    if (!check.success) errors.newPassword = check.error.issues[0]?.message ?? 'required';
    if (newPassword !== form.get('passwordConfirm')) errors.passwordConfirm = 'passwordMismatch';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setPending(true);
    const { error } = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });
    setPending(false);
    if (error) {
      setMessage({ tone: 'error', text: tErrors(authErrorKey(error)) });
      return;
    }
    formElement.reset();
    setMessage({ tone: 'success', text: t('changed') });
  }

  const fieldError = (name: string) =>
    fieldErrors[name] ? tValidation(fieldErrors[name]) : undefined;
  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-5" noValidate>
      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
      <TextField
        name="currentPassword"
        type="password"
        label={t('current')}
        autoComplete="current-password"
        dir="ltr"
        required
        error={fieldError('currentPassword')}
      />
      <TextField
        name="newPassword"
        type="password"
        label={t('new')}
        hint={t('hint', { min: minLength })}
        autoComplete="new-password"
        dir="ltr"
        required
        error={fieldError('newPassword')}
      />
      <TextField
        name="passwordConfirm"
        type="password"
        label={t('confirm')}
        autoComplete="new-password"
        dir="ltr"
        required
        error={fieldError('passwordConfirm')}
      />
      <SubmitButton pending={pending} pendingLabel={t('saving')}>
        {t('submit')}
      </SubmitButton>
    </form>
  );
}
