'use client';

import { PASSWORD_MIN_LENGTH, passwordField } from '@rentagent/shared';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { FormMessage, SubmitButton, TextField } from '@/components/forms';
import { useRouter } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { authErrorKey } from '@/lib/auth-errors';

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations('Auth.reset');
  const tValidation = useTranslations('Validation');
  const tErrors = useTranslations('AuthErrors');
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    const errors: Record<string, string> = {};
    const check = passwordField.safeParse(password);
    if (!check.success) errors.password = check.error.issues[0]?.message ?? 'required';
    if (password !== form.get('passwordConfirm')) errors.passwordConfirm = 'passwordMismatch';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setPending(true);
    setError(undefined);
    const { error: resetError } = await authClient.resetPassword({ newPassword: password, token });
    if (resetError) {
      setPending(false);
      setError(authErrorKey(resetError));
      return;
    }
    router.replace({ pathname: '/sign-in', query: { reset: '1' } });
  }

  const fieldError = (name: string) =>
    fieldErrors[name] ? tValidation(fieldErrors[name]) : undefined;
  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {error && <FormMessage tone="error">{tErrors(error)}</FormMessage>}
      <TextField
        name="password"
        type="password"
        label={t('password')}
        hint={t('passwordHint', { min: PASSWORD_MIN_LENGTH })}
        autoComplete="new-password"
        dir="ltr"
        required
        error={fieldError('password')}
      />
      <TextField
        name="passwordConfirm"
        type="password"
        label={t('passwordConfirm')}
        autoComplete="new-password"
        dir="ltr"
        required
        error={fieldError('passwordConfirm')}
      />
      <SubmitButton
        pending={pending}
        pendingLabel={t('submitting')}
        className="btn btn-primary w-full"
      >
        {t('submit')}
      </SubmitButton>
    </form>
  );
}
