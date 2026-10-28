'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from '@/i18n/navigation';
import {
  A11Y_STORAGE_KEY,
  type A11yPreferences,
  applyA11y,
  DEFAULT_A11Y,
  parseA11y,
  TEXT_SIZES,
} from '@/lib/a11y-preferences';

function load(): A11yPreferences {
  try {
    return parseA11y(window.localStorage.getItem(A11Y_STORAGE_KEY));
  } catch {
    return DEFAULT_A11Y;
  }
}

/**
 * Reading aids (text size, contrast, link highlighting, readable font, no motion).
 * A convenience on top of the accessible markup — not a replacement for it.
 */
export function AccessibilityMenu() {
  const t = useTranslations('A11y');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [preferences, setPreferences] = useState<A11yPreferences>(DEFAULT_A11Y);
  const [status, setStatus] = useState('');

  useEffect(() => {
    // Syncing from browser storage (an external system) on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreferences(load());
  }, []);

  function update(next: A11yPreferences) {
    setPreferences(next);
    applyA11y(next, document.documentElement);
    try {
      window.localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage may be blocked; the change still applies to this page.
    }
    setStatus(t('applied'));
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-primary fixed bottom-4 start-4 z-40 shadow-lg print:hidden"
        aria-haspopup="dialog"
        onClick={() => {
          setStatus('');
          dialogRef.current?.showModal();
        }}
      >
        <span aria-hidden="true">♿</span> {t('button')}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-lg border border-border bg-bg p-6 text-fg backdrop:bg-black/50"
      >
        <h2 id={titleId} className="text-xl font-bold">
          {t('title')}
        </h2>
        <p className="mt-1 text-sm text-muted">{t('intro')}</p>
        <fieldset className="mt-4">
          <legend className="mb-2 font-semibold">{t('textSize')}</legend>
          <div className="flex flex-wrap gap-3">
            {TEXT_SIZES.map((size) => (
              <label
                key={size}
                className="flex items-center gap-2 rounded border border-border px-3 py-2"
              >
                <input
                  type="radio"
                  name="a11y-size"
                  className="size-5"
                  checked={preferences.size === size}
                  onChange={() => update({ ...preferences, size })}
                />
                <span dir="ltr">{size}%</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-4 space-y-3">
          {(['contrast', 'links', 'font', 'motion'] as const).map((flag) => (
            <label key={flag} className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 size-5"
                checked={preferences[flag]}
                onChange={(event) => update({ ...preferences, [flag]: event.target.checked })}
              />
              <span>{t(flag)}</span>
            </label>
          ))}
        </div>
        <p role="status" className="mt-3 min-h-6 text-sm">
          {status}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-secondary" onClick={() => update(DEFAULT_A11Y)}>
            {t('reset')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => dialogRef.current?.close()}
          >
            {t('close')}
          </button>
          <Link className="link" href="/accessibility" onClick={() => dialogRef.current?.close()}>
            {t('statement')}
          </Link>
        </div>
      </dialog>
    </>
  );
}
