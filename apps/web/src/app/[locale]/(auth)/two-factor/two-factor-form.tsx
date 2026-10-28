'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { FormMessage, SubmitButton, TextField } from '@/components/forms';
import { Link } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { authErrorKey } from '@/lib/auth-errors';

export function TwoFactorForm({ nextPath }: { nextPath: string }) {
  const t = useTranslations('Auth.twoFactor');
  const tErrors = useTranslations('AuthErrors');
  const [mode, setMode] = useState<'totp' | 'backup'>('totp');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const code = String(form.get('code') ?? '').replace(/\s+/g, '');
    const trustDevice = form.get('trustDevice') === 'on';
    setPending(true);
    setError(undefined);
    const { error: verifyError } =
      mode === 'totp'
        ? await authClient.twoFactor.verifyTotp({ code, trustDevice })
        : await authClient.twoFactor.verifyBackupCode({ code, trustDevice });
    if (verifyError) {
      setPending(false);
      setError(authErrorKey(verifyError));
      return;
    }
    window.location.assign(nextPath);
  }

  const expired = error === 'twoFactorExpired';
  return (
    <form key={mode} onSubmit={onSubmit} className="space-y-5" noValidate>
      {error && (
        <FormMessage tone="error">
          {tErrors(error)}{' '}
          {expired && (
            <Link className="link" href="/sign-in">
              {t('backToSignIn')}
            </Link>
          )}
        </FormMessage>
      )}
      {mode === 'totp' ? (
        <TextField
          name="code"
          label={t('code')}
          hint={t('codeHint')}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          dir="ltr"
          required
          autoFocus
          className="field-input font-mono tracking-widest"
        />
      ) : (
        <TextField
          name="code"
          label={t('backupCode')}
          hint={t('backupHint')}
          autoComplete="off"
          spellCheck={false}
          dir="ltr"
          required
          autoFocus
          className="field-input font-mono"
        />
      )}
      <label className="flex items-center gap-3">
        <input type="checkbox" name="trustDevice" className="size-5" />
        {t('trustDevice')}
      </label>
      <SubmitButton
        pending={pending}
        pendingLabel={t('submitting')}
        className="btn btn-primary w-full"
      >
        {t('submit')}
      </SubmitButton>
      <button
        type="button"
        className="link text-sm"
        onClick={() => {
          setError(undefined);
          setMode(mode === 'totp' ? 'backup' : 'totp');
        }}
      >
        {mode === 'totp' ? t('useBackup') : t('useApp')}
      </button>
    </form>
  );
}
