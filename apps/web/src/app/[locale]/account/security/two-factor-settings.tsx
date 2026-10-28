'use client';

import { useTranslations } from 'next-intl';
import QRCode from 'qrcode';
import { type FormEvent, useState } from 'react';
import { FormMessage, SubmitButton, TextField } from '@/components/forms';
import { authClient } from '@/lib/auth-client';
import { authErrorKey } from '@/lib/auth-errors';

type Step =
  | { kind: 'idle' }
  | { kind: 'password'; action: 'enable' | 'disable' | 'regenerate' }
  | { kind: 'verify'; qrDataUrl: string; secret: string; backupCodes: string[] }
  | { kind: 'codes'; backupCodes: string[] };

function BackupCodes({ codes }: { codes: string[] }) {
  const t = useTranslations('Account.security.twoFactor');
  const [copied, setCopied] = useState(false);
  const text = codes.join('\n');
  const download = () => {
    const url = URL.createObjectURL(new Blob([`${text}\n`], { type: 'text/plain' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'backup-codes.txt';
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="rounded-lg border border-border bg-bg p-4">
      <h3 className="font-semibold">{t('backupTitle')}</h3>
      <p className="mt-1 text-sm text-muted">{t('backupIntro')}</p>
      <ol className="mt-3 grid grid-cols-2 gap-2 font-mono" dir="ltr">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void navigator.clipboard.writeText(text).then(() => setCopied(true))}
        >
          {t('copy')}
        </button>
        <button type="button" className="btn btn-secondary" onClick={download}>
          {t('download')}
        </button>
      </div>
      <p role="status" className="mt-2 text-sm">
        {copied ? t('copied') : ''}
      </p>
    </div>
  );
}

export function TwoFactorSettings({ enabled }: { enabled: boolean }) {
  const t = useTranslations('Account.security.twoFactor');
  const tErrors = useTranslations('AuthErrors');
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function onPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step.kind !== 'password') return;
    const password = String(new FormData(event.currentTarget).get('password') ?? '');
    setPending(true);
    setError(undefined);
    if (step.action === 'enable') {
      const { data, error: enableError } = await authClient.twoFactor.enable({ password });
      setPending(false);
      if (enableError || !data || data.method !== 'totp')
        return setError(authErrorKey(enableError));
      const secret = new URL(data.totpURI).searchParams.get('secret') ?? '';
      const qrDataUrl = await QRCode.toDataURL(data.totpURI, { margin: 1, width: 224 });
      setStep({ kind: 'verify', qrDataUrl, secret, backupCodes: data.backupCodes });
    } else if (step.action === 'disable') {
      const { error: disableError } = await authClient.twoFactor.disable({ password });
      if (disableError) {
        setPending(false);
        return setError(authErrorKey(disableError));
      }
      window.location.reload();
    } else {
      const { data, error: codesError } = await authClient.twoFactor.generateBackupCodes({
        password,
      });
      setPending(false);
      if (codesError || !data) return setError(authErrorKey(codesError));
      setStep({ kind: 'codes', backupCodes: data.backupCodes });
    }
  }

  async function onVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get('code') ?? '').replace(/\s+/g, '');
    setPending(true);
    setError(undefined);
    const { error: verifyError } = await authClient.twoFactor.verifyTotp({ code });
    if (verifyError) {
      setPending(false);
      return setError(authErrorKey(verifyError));
    }
    window.location.reload();
  }

  const errorMessage = error && <FormMessage tone="error">{tErrors(error)}</FormMessage>;

  if (step.kind === 'password') {
    return (
      <form onSubmit={onPassword} className="mt-4 space-y-5" noValidate>
        {errorMessage}
        <TextField
          name="password"
          type="password"
          label={t('confirmPassword')}
          autoComplete="current-password"
          dir="ltr"
          required
        />
        <div className="flex flex-wrap gap-2">
          <SubmitButton pending={pending} pendingLabel={t('working')}>
            {t('continue')}
          </SubmitButton>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setStep({ kind: 'idle' })}
          >
            {t('cancel')}
          </button>
        </div>
      </form>
    );
  }

  if (step.kind === 'verify') {
    return (
      <div className="mt-4 space-y-6">
        <ol className="list-decimal space-y-2 ps-6">
          <li>{t('scanStep')}</li>
          <li>{t('codeStep')}</li>
        </ol>
        {/* eslint-disable-next-line @next/next/no-img-element -- data URL generated locally */}
        <img
          src={step.qrDataUrl}
          width={224}
          height={224}
          alt={t('qrAlt')}
          className="rounded bg-white p-2"
        />
        <p>
          {t('manualKey')}{' '}
          <code dir="ltr" className="break-all rounded bg-surface px-2 py-1 font-mono">
            {step.secret}
          </code>
        </p>
        <BackupCodes codes={step.backupCodes} />
        <form onSubmit={onVerify} className="space-y-5" noValidate>
          {errorMessage}
          <TextField
            name="code"
            label={t('verifyCode')}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            dir="ltr"
            required
            className="field-input font-mono tracking-widest"
          />
          <SubmitButton pending={pending} pendingLabel={t('working')}>
            {t('activate')}
          </SubmitButton>
        </form>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <p>
        <strong>{enabled ? t('statusOn') : t('statusOff')}</strong>
      </p>
      <p className="text-muted">{t('intro')}</p>
      {step.kind === 'codes' && <BackupCodes codes={step.backupCodes} />}
      <div className="flex flex-wrap gap-2">
        {enabled ? (
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setStep({ kind: 'password', action: 'regenerate' })}
            >
              {t('regenerate')}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setStep({ kind: 'password', action: 'disable' })}
            >
              {t('disable')}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setStep({ kind: 'password', action: 'enable' })}
          >
            {t('enable')}
          </button>
        )}
      </div>
    </div>
  );
}
