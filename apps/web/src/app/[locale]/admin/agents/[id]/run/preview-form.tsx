'use client';

import type { AgentInputField } from '@rentagent/shared';
import { TaskFields } from '@/components/task-fields';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { FormMessage, SubmitButton } from '@/components/forms';
import { useAction } from '@/components/use-action';
import { useRouter } from '@/i18n/navigation';
import { startPreviewRun } from '../../actions';

interface PreviewFormProps {
  agentId: string;
  locale: string;
  draftFields: AgentInputField[];
  publishedFields: AgentInputField[] | null;
  publishedVersion: number | null;
}

export function PreviewForm({
  agentId,
  locale,
  draftFields,
  publishedFields,
  publishedVersion,
}: PreviewFormProps) {
  const t = useTranslations('AdminAgents.preview');
  const tErrors = useTranslations('AdminAgents.errors');
  const router = useRouter();
  const [source, setSource] = useState<'draft' | 'published'>('draft');
  const { pending, outcome, run, fieldErrors } = useAction();
  const fields = source === 'draft' || !publishedFields ? draftFields : publishedFields;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = Object.fromEntries(
      [...new FormData(event.currentTarget).entries()]
        .filter(([key]) => !key.startsWith('__'))
        .map(([key, value]) => [key, String(value)]),
    );
    run(
      () => startPreviewRun(agentId, input, { useDraft: source === 'draft', locale }),
      (result) => router.push(`/admin/runs/${result.id}`),
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {outcome && !outcome.ok && <FormMessage tone="error">{tErrors(outcome.error)}</FormMessage>}
      <fieldset>
        <legend className="mb-2 font-semibold">{t('source')}</legend>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="__source"
              className="size-5"
              checked={source === 'draft'}
              onChange={() => setSource('draft')}
            />
            {t('draft')}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="__source"
              className="size-5"
              checked={source === 'published'}
              disabled={publishedVersion === null}
              onChange={() => setSource('published')}
            />
            {publishedVersion === null
              ? t('notPublished')
              : t('published', { version: publishedVersion })}
          </label>
        </div>
      </fieldset>
      <TaskFields key={source} fields={fields} errors={fieldErrors} />
      <SubmitButton pending={pending} pendingLabel={t('starting')}>
        {t('start')}
      </SubmitButton>
    </form>
  );
}
