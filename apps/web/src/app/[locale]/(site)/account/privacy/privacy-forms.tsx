'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { FormMessage, SubmitButton, TextField } from '@/components/forms';
import { useAction } from '@/components/use-action';
import { deleteAllConversations } from '../../chats/actions';
import { deleteAccount } from './actions';

export function DeleteHistoryButton() {
  const t = useTranslations('Privacy');
  const [confirming, setConfirming] = useState(false);
  const { pending, outcome, run } = useAction();
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  return (
    <div className="space-y-3">
      {outcome?.ok && <FormMessage tone="success">{t('historyDeleted')}</FormMessage>}
      {outcome && !outcome.ok && <FormMessage tone="error">{t('error')}</FormMessage>}
      {confirming ? (
        <div
          role="group"
          aria-label={t('historyButton')}
          className="flex flex-wrap items-center gap-2"
        >
          <span>{t('historyConfirm')}</span>
          <button
            ref={confirmRef}
            type="button"
            className="btn btn-primary"
            disabled={pending}
            onClick={() => run(deleteAllConversations, () => setConfirming(false))}
          >
            {t('confirmYes')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setConfirming(false)}>
            {t('cancel')}
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-secondary" onClick={() => setConfirming(true)}>
          {t('historyButton')}
        </button>
      )}
    </div>
  );
}

export function DeleteAccountForm() {
  const t = useTranslations('Privacy');
  const { pending, outcome, run } = useAction();
  const [unconfirmed, setUnconfirmed] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setUnconfirmed(!data.get('confirm'));
    if (!data.get('confirm')) return;
    const password = String(data.get('password') ?? '');
    run(
      () => deleteAccount(password),
      // A full navigation drops every client cache of the deleted session.
      () =>
        window.location.replace(
          new URL(`/${document.documentElement.lang}?accountDeleted=1`, window.location.origin),
        ),
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {outcome && !outcome.ok && (
        <FormMessage tone="error">
          {t.has(`errors.${outcome.error}`) ? t(`errors.${outcome.error}`) : t('error')}
        </FormMessage>
      )}
      <TextField
        name="password"
        type="password"
        label={t('passwordLabel')}
        autoComplete="current-password"
        required
        dir="ltr"
      />
      <div>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            name="confirm"
            required
            className="mt-1 size-5"
            aria-invalid={unconfirmed}
            aria-describedby={unconfirmed ? 'delete-confirm-error' : undefined}
          />
          <span>{t('deleteConfirmCheckbox')}</span>
        </label>
        {unconfirmed && (
          <p id="delete-confirm-error" className="mt-1 text-sm font-semibold text-danger">
            {t('confirmRequired')}
          </p>
        )}
      </div>
      <SubmitButton pending={pending} pendingLabel={t('deleting')} className="btn btn-primary">
        {t('deleteButton')}
      </SubmitButton>
    </form>
  );
}
