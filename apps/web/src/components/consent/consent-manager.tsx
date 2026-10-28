'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_SECONDS,
  CONSENT_POLICY_VERSION,
  type ConsentChoices,
  OPTIONAL_CATEGORIES,
  parseStoredConsent,
} from '@/lib/consent';
import { recordConsent } from '@/lib/server/consent-actions';

const NONE: ConsentChoices = { analytics: false, marketing: false };
const ALL: ConsentChoices = { analytics: true, marketing: true };

function readConsent() {
  const raw = document.cookie
    .split('; ')
    .find((part) => part.startsWith(`${CONSENT_COOKIE}=`))
    ?.slice(CONSENT_COOKIE.length + 1);
  return parseStoredConsent(raw);
}

function writeConsent(choices: ConsentChoices) {
  const value = encodeURIComponent(
    JSON.stringify({ v: CONSENT_POLICY_VERSION, c: choices, t: Date.now() }),
  );
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${CONSENT_COOKIE}=${value}; Path=/; Max-Age=${CONSENT_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
  // Script loaders (phase 6) listen for this event to start or stop optional trackers.
  window.dispatchEvent(new CustomEvent('ra:consent', { detail: choices }));
}

/**
 * Footer trigger + preferences dialog + (only when optional trackers exist) the first-visit banner.
 * Rejecting is exactly as easy and as prominent as accepting.
 */
export function ConsentManager({ optionalTrackersEnabled }: { optionalTrackersEnabled: boolean }) {
  const t = useTranslations('Consent');
  const tFooter = useTranslations('Footer');
  const tCommon = useTranslations('Common');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [choices, setChoices] = useState<ConsentChoices>(NONE);
  const [showBanner, setShowBanner] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    const stored = readConsent();
    // Reading a cookie is an external system sync, so state is set from an effect on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setChoices(stored.c);
    else if (optionalTrackersEnabled) setShowBanner(true);
  }, [optionalTrackersEnabled]);

  const save = useCallback(
    (next: ConsentChoices) => {
      setChoices(next);
      writeConsent(next);
      setShowBanner(false);
      setStatus(t('saved'));
      void recordConsent(next);
      if (dialogRef.current?.open) dialogRef.current.close();
    },
    [t],
  );

  const openDialog = () => {
    setStatus('');
    dialogRef.current?.showModal();
  };

  return (
    <>
      <button ref={triggerRef} type="button" className="link text-start" onClick={openDialog}>
        {tFooter('privacySettings')}
      </button>
      <p role="status" className="sr-only">
        {status}
      </p>

      {showBanner && (
        <section
          aria-label={t('dialogTitle')}
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg p-4 shadow-lg"
        >
          <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:flex-row sm:items-center">
            <p className="flex-1">{t('bannerText')}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary" onClick={() => save(ALL)}>
                {t('acceptAll')}
              </button>
              <button type="button" className="btn btn-primary" onClick={() => save(NONE)}>
                {t('rejectAll')}
              </button>
              <button type="button" className="btn btn-secondary" onClick={openDialog}>
                {t('manage')}
              </button>
            </div>
          </div>
        </section>
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={() => triggerRef.current?.focus()}
        className="m-auto w-[min(36rem,calc(100%-2rem))] rounded-lg border border-border bg-bg p-6 text-fg backdrop:bg-black/50"
      >
        <form
          method="dialog"
          onSubmit={(event) => {
            event.preventDefault();
            save(choices);
          }}
        >
          <h2 id={titleId} className="text-xl font-bold">
            {t('dialogTitle')}
          </h2>
          <p className="mt-2 text-muted">{t('intro')}</p>

          <fieldset className="mt-4 space-y-4">
            <legend className="sr-only">{t('dialogTitle')}</legend>
            <div className="rounded-lg border border-border p-3">
              <p className="font-semibold">
                {t('essentialTitle')} — <span className="font-normal">{t('alwaysOn')}</span>
              </p>
              <p className="text-sm text-muted">{t('essentialBody')}</p>
            </div>
            {OPTIONAL_CATEGORIES.map((category) => (
              <div key={category} className="rounded-lg border border-border p-3">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 size-5"
                    checked={choices[category]}
                    onChange={(event) =>
                      setChoices((prev) => ({ ...prev, [category]: event.target.checked }))
                    }
                  />
                  <span>
                    <span className="font-semibold">{t(`${category}Title`)}</span>
                    <span className="block text-sm text-muted">{t(`${category}Body`)}</span>
                    {!optionalTrackersEnabled && (
                      <span className="block text-sm text-muted">{t('notInUse')}</span>
                    )}
                  </span>
                </label>
              </div>
            ))}
          </fieldset>

          <div className="mt-6 flex flex-wrap gap-2">
            <button type="submit" className="btn btn-primary">
              {t('save')}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => save(ALL)}>
              {t('acceptAll')}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => save(NONE)}>
              {t('rejectAll')}
            </button>
            <button
              type="button"
              className="btn btn-secondary ms-auto"
              onClick={() => dialogRef.current?.close()}
            >
              {tCommon('close')}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
