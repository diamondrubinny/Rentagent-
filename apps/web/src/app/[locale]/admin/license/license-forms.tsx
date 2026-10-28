'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useRef, useState, useTransition } from 'react';
import { FormMessage, SubmitButton } from '@/components/forms';
import { useRouter } from '@/i18n/navigation';
import type { ActionResult } from '@/lib/server/admin-action';
import { activateLicense, checkLicenseNow, removeLicense } from './actions';

function useResult() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (action: () => Promise<ActionResult>, after?: () => void) =>
    startTransition(async () => {
      const next = await action();
      setResult(next);
      if (next.ok) after?.();
      router.refresh();
    });
  return { pending, result, run };
}

export function ActivateForm() {
  const t = useTranslations('AdminLicense');
  const { pending, result, run } = useResult();
  const [token, setToken] = useState('');
  return (
    <form
      className="space-y-3"
      noValidate
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        run(
          () => activateLicense({ token }),
          () => setToken(''),
        );
      }}
    >
      {result?.ok && <FormMessage tone="success">{t('activated')}</FormMessage>}
      {result && !result.ok && (
        <FormMessage tone="error">{t(`errors.${result.error}`)}</FormMessage>
      )}
      <label htmlFor="license-token" className="block font-semibold">
        {t('tokenLabel')}
      </label>
      <p id="license-token-hint" className="text-sm text-muted">
        {t('tokenHint')}
      </p>
      <textarea
        id="license-token"
        name="token"
        value={token}
        onChange={(event) => setToken(event.target.value)}
        rows={4}
        dir="ltr"
        spellCheck={false}
        autoComplete="off"
        maxLength={4200}
        className="field-input font-mono text-sm break-all"
        aria-describedby="license-token-hint"
        aria-invalid={Boolean(result && !result.ok)}
        required
      />
      <SubmitButton pending={pending} pendingLabel={t('activating')}>
        {t('activate')}
      </SubmitButton>
    </form>
  );
}

export function LicenseActions({ online, removable }: { online: boolean; removable: boolean }) {
  const t = useTranslations('AdminLicense');
  const { pending, result, run } = useResult();
  const [confirming, setConfirming] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);
  return (
    <div className="space-y-3">
      {result?.ok && <FormMessage tone="success">{t('done')}</FormMessage>}
      {result && !result.ok && (
        <FormMessage tone="error">{t(`errors.${result.error}`)}</FormMessage>
      )}
      {confirming ? (
        <div role="group" aria-label={t('remove')} className="flex flex-wrap items-center gap-2">
          <span>{t('removeConfirm')}</span>
          <button
            ref={confirmRef}
            type="button"
            className="btn btn-primary"
            disabled={pending}
            onClick={() => run(removeLicense, () => setConfirming(false))}
          >
            {t('removeYes')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setConfirming(false)}>
            {t('cancel')}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {online && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={pending}
              onClick={() => run(checkLicenseNow)}
            >
              {t('checkNow')}
            </button>
          )}
          {removable && (
            <button type="button" className="btn btn-secondary" onClick={() => setConfirming(true)}>
              {t('remove')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
