'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useAction } from '@/components/use-action';
import { useRouter } from '@/i18n/navigation';
import { deleteConversation } from './actions';

/** Two-step delete: the first press asks for confirmation in place. */
export function DeleteConversationButton({
  id,
  title,
  describedBy,
  redirectTo,
}: {
  id: string;
  title: string;
  /** Id of the element naming the chat (keeps the visible label as the accessible name). */
  describedBy: string;
  redirectTo?: string;
}) {
  const t = useTranslations('Chat');
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const { pending, outcome, run } = useAction();
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  if (!confirming)
    return (
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => setConfirming(true)}
        aria-describedby={describedBy}
      >
        {t('delete')}
      </button>
    );
  return (
    <div
      role="group"
      aria-label={t('deleteNamed', { title })}
      className="flex flex-wrap items-center gap-2"
    >
      <span>{t('deleteConfirm')}</span>
      <button
        ref={confirmRef}
        type="button"
        className="btn btn-primary"
        disabled={pending}
        onClick={() =>
          run(
            () => deleteConversation(id),
            () => (redirectTo ? router.push(redirectTo) : router.refresh()),
          )
        }
      >
        {t('deleteYes')}
      </button>
      <button type="button" className="btn btn-secondary" onClick={() => setConfirming(false)}>
        {t('cancel')}
      </button>
      {outcome && !outcome.ok && (
        <span role="alert" className="text-danger">
          {t(`errors.${outcome.error}`)}
        </span>
      )}
    </div>
  );
}
