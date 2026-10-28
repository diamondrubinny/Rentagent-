'use client';

import type { AgentInputField } from '@rentagent/shared';
import { useTranslations } from 'next-intl';
import type { FormEvent } from 'react';
import { FormMessage, SubmitButton } from '@/components/forms';
import { TaskFields } from '@/components/task-fields';
import { useAction } from '@/components/use-action';
import { useRouter } from '@/i18n/navigation';
import { startConversation } from '../../chats/actions';

export function StartForm({
  slug,
  locale,
  fields,
}: {
  slug: string;
  locale: string;
  fields: AgentInputField[];
}) {
  const t = useTranslations('Catalog');
  const tErrors = useTranslations('Chat.errors');
  const router = useRouter();
  const { pending, outcome, run, fieldErrors } = useAction();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = Object.fromEntries(
      [...new FormData(event.currentTarget).entries()].map(([key, value]) => [key, String(value)]),
    );
    run(
      () => startConversation(slug, input, locale),
      (result) => router.push(`/chats/${result.id}`),
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-5" noValidate>
      {outcome && !outcome.ok && <FormMessage tone="error">{tErrors(outcome.error)}</FormMessage>}
      {fields.length === 0 && <p>{t('noFields')}</p>}
      <TaskFields fields={fields} errors={fieldErrors} />
      <SubmitButton pending={pending} pendingLabel={t('starting')}>
        {t('start')}
      </SubmitButton>
    </form>
  );
}
