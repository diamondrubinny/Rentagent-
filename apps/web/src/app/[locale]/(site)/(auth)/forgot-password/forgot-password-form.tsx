'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { FormMessage, SubmitButton, TextField } from '@/components/forms';
import { Link } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { authErrorKey } from '@/lib/auth-errors';

export function ForgotPasswordForm({ locale }: { locale: string }) {
  const t = useTranslations('Auth.forgot');
  const tErrors = useTranslations('AuthErrors');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get('email') ?? '').trim();
    setPending(true);
    setError(undefined);
    const { error: requestError } = await authClient.requestPasswordReset({
      email,
      redirectTo: `/${locale}/reset-password`,
    });
    setPending(false);
    // Only rate limiting is surfaced; everything else shows the same neutral confirmation.
    if (requestError?.status === 429) {
      setError(authErrorKey(requestError));
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="space-y-4">
        <FormMessage tone="success">{t('success')}</FormMessage>
        <Link className="link" href="/sign-in">
          {t('back')}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {error && <FormMessage tone="error">{tErrors(error)}</FormMessage>}
      <TextField
        name="email"
        type="email"
        label={t('email')}
        autoComplete="email"
        dir="ltr"
        required
      />
      <SubmitButton
        pending={pending}
        pendingLabel={t('submitting')}
        className="btn btn-primary w-full"
      >
        {t('submit')}
      </SubmitButton>
      <Link className="link block text-sm" href="/sign-in">
        {t('back')}
      </Link>
    </form>
  );
}
