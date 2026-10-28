'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FormMessage } from '@/components/forms';
import { useAction } from '@/components/use-action';
import { setAiDisabled } from './actions';

export function KillSwitch({ disabled }: { disabled: boolean }) {
  const t = useTranslations('AdminAi.killSwitch');
  const tErrors = useTranslations('AdminAi.errors');
  const { pending, outcome, run } = useAction();
  const [confirming, setConfirming] = useState(false);

  return (
    <div
      className={`rounded-lg border-2 p-4 ${disabled ? 'border-danger bg-danger-bg' : 'border-border bg-surface'}`}
    >
      <h2 className="text-lg font-bold">{t('title')}</h2>
      <p className="mt-1">{disabled ? t('stateOff') : t('stateOn')}</p>
      <p className="mt-1 text-sm text-muted">{t('help')}</p>
      {outcome && !outcome.ok && <FormMessage tone="error">{tErrors(outcome.error)}</FormMessage>}
      <div className="mt-3 flex flex-wrap gap-2">
        {disabled ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending}
            onClick={() => run(() => setAiDisabled(false))}
          >
            {t('resume')}
          </button>
        ) : confirming ? (
          <>
            <button
              type="button"
              className="btn bg-danger text-primary-fg"
              disabled={pending}
              onClick={() =>
                run(
                  () => setAiDisabled(true),
                  () => setConfirming(false),
                )
              }
            >
              {t('confirmStop')}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setConfirming(false)}
            >
              {t('cancel')}
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-secondary" onClick={() => setConfirming(true)}>
            {t('stop')}
          </button>
        )}
      </div>
    </div>
  );
}
