'use client';

import { accountSchema, PASSWORD_MIN_LENGTH } from '@rentagent/shared';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { FormMessage, SubmitButton, TextField, zodFieldErrors } from '@/components/forms';
import { Link } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { authErrorKey } from '@/lib/auth-errors';

export function SignUpForm({ locale }: { locale: string }) {
  const t = useTranslations('Auth.signUp');
  const tValidation = useTranslations('Validation');
  const tErrors = useTranslations('AuthErrors');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    const parsed = accountSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!parsed.success) {
      setFieldErrors(zodFieldErrors(parsed.error.issues));
      return;
    }
    setFieldErrors({});
    setPending(true);
    const { error: signUpError } = await authClient.signUp.email({
      name: parsed.data.name,
      email: parsed.data.email,
      password: parsed.data.password,
      locale,
      callbackURL: `/${locale}/sign-in?verified=1`,
    });
    setPending(false);
    if (signUpError) {
      setError(authErrorKey(signUpError));
      return;
    }
    // Same message whether or not the address already had an account (no enumeration).
    setDone(true);
  }

  if (done) return <FormMessage tone="success">{t('success')}</FormMessage>;

  const fieldError = (name: string) =>
    fieldErrors[name] ? tValidation(fieldErrors[name]) : undefined;
  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {error && <FormMessage tone="error">{tErrors(error)}</FormMessage>}
      <TextField
        name="name"
        label={t('name')}
        autoComplete="name"
        dir="auto"
        required
        error={fieldError('name')}
      />
      <TextField
        name="email"
        type="email"
        label={t('email')}
        autoComplete="email"
        dir="ltr"
        required
        error={fieldError('email')}
      />
      <TextField
        name="password"
        type="password"
        label={t('password')}
        hint={t('passwordHint', { min: PASSWORD_MIN_LENGTH })}
        autoComplete="new-password"
        dir="ltr"
        required
        minLength={PASSWORD_MIN_LENGTH}
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
      <p className="text-sm">
        {t('haveAccount')}{' '}
        <Link className="link" href="/sign-in">
          {t('signInLink')}
        </Link>
      </p>
    </form>
  );
}
