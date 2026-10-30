'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { FormMessage, SubmitButton, TextField } from '@/components/forms';
import { Link, useRouter } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { authErrorKey } from '@/lib/auth-errors';

interface SignInFormProps {
  nextPath: string;
  notice?: string;
  linkError?: string;
  registrationOpen: boolean;
}

export function SignInForm({ nextPath, notice, linkError, registrationOpen }: SignInFormProps) {
  const t = useTranslations('Auth.signIn');
  const tErrors = useTranslations('AuthErrors');
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>(linkError);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(undefined);
    const { data, error: signInError } = await authClient.signIn.email({
      email: String(form.get('email') ?? '').trim(),
      password: String(form.get('password') ?? ''),
      rememberMe: form.get('rememberMe') === 'on',
    });
    if (signInError) {
      setPending(false);
      setError(authErrorKey(signInError));
      return;
    }
    if (data && 'twoFactorRedirect' in data && data.twoFactorRedirect) {
      router.push({ pathname: '/two-factor', query: { next: nextPath } });
      return;
    }
    // Full navigation so every server component renders with the new session.
    window.location.assign(nextPath);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {notice && !error && <FormMessage tone="success">{notice}</FormMessage>}
      {error && <FormMessage tone="error">{tErrors(error)}</FormMessage>}
      <TextField
        name="email"
        type="email"
        label={t('email')}
        autoComplete="email"
        dir="ltr"
        required
      />
      <TextField
        name="password"
        type="password"
        label={t('password')}
        autoComplete="current-password"
        dir="ltr"
        required
      />
      <label className="flex items-center gap-3">
        <input type="checkbox" name="rememberMe" className="size-5" defaultChecked />
        {t('rememberMe')}
      </label>
      <SubmitButton
        pending={pending}
        pendingLabel={t('submitting')}
        className="btn btn-primary w-full"
      >
        {t('submit')}
      </SubmitButton>
      <p className="text-sm">
        <Link className="link" href="/forgot-password">
          {t('forgot')}
        </Link>
      </p>
      {registrationOpen && (
        <p className="text-sm">
          {t('noAccount')}{' '}
          <Link className="link" href="/sign-up">
            {t('signUpLink')}
          </Link>
        </p>
      )}
    </form>
  );
}
