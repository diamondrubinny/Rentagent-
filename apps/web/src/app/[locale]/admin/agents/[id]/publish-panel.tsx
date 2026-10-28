'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FormMessage } from '@/components/forms';
import { useAction } from '@/components/use-action';
import { Link, useRouter } from '@/i18n/navigation';
import { deleteAgent, publishAgent, restoreVersion, setAgentStatus } from '../actions';

interface VersionView {
  id: string;
  version: number;
  note: string | null;
  createdAt: string;
  isPublished: boolean;
}

export function PublishPanel({
  agentId,
  status,
  publishedVersion,
  versions,
}: {
  agentId: string;
  status: string;
  publishedVersion: number | null;
  versions: VersionView[];
}) {
  const t = useTranslations('AdminAgents.publish');
  const tStatus = useTranslations('AdminAgents.status');
  const tErrors = useTranslations('AdminAgents.errors');
  const router = useRouter();
  const { pending, outcome, run } = useAction();
  const [note, setNote] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  let message: string | null = null;
  if (outcome?.ok)
    message = outcome.values?.version
      ? t('published', { version: outcome.values.version })
      : t('done');

  return (
    <section
      aria-labelledby="publish-title"
      className="space-y-4 rounded-lg border-2 border-border bg-surface p-6"
    >
      <h2 id="publish-title" className="text-xl font-bold">
        {t('title')}
      </h2>
      <p>
        <strong>{tStatus(status)}</strong>
        {publishedVersion !== null && ` · ${t('liveVersion', { version: publishedVersion })}`}
      </p>
      {message && <FormMessage tone="success">{message}</FormMessage>}
      {outcome && !outcome.ok && <FormMessage tone="error">{tErrors(outcome.error)}</FormMessage>}

      <div className="flex flex-wrap items-end gap-2">
        <label className="grow">
          <span className="mb-1 block text-sm font-semibold">{t('note')}</span>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={300}
            dir="auto"
            className="field-input"
          />
        </label>
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          onClick={() =>
            run(
              () => publishAgent(agentId, note),
              () => setNote(''),
            )
          }
        >
          {t('publish')}
        </button>
      </div>
      <p className="text-sm text-muted">{t('publishHint')}</p>

      <div className="flex flex-wrap gap-2">
        <Link className="btn btn-secondary" href={`/admin/agents/${agentId}/run`}>
          {t('preview')}
        </Link>
        <a className="btn btn-secondary" href={`/api/admin/agents/${agentId}/export`} download>
          {t('export')}
        </a>
        {status === 'PUBLISHED' && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={pending}
            onClick={() => run(() => setAgentStatus(agentId, 'PAUSED'))}
          >
            {t('pause')}
          </button>
        )}
        {(status === 'PAUSED' || status === 'ARCHIVED') && publishedVersion !== null && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={pending}
            onClick={() => run(() => setAgentStatus(agentId, 'PUBLISHED'))}
          >
            {t('resume')}
          </button>
        )}
        {status !== 'ARCHIVED' && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={pending}
            onClick={() => run(() => setAgentStatus(agentId, 'ARCHIVED'))}
          >
            {t('archive')}
          </button>
        )}
        {confirmDelete ? (
          <>
            <button
              type="button"
              className="btn bg-danger text-primary-fg"
              disabled={pending}
              onClick={() =>
                run(
                  () => deleteAgent(agentId),
                  () => router.push('/admin/agents'),
                )
              }
            >
              {t('confirmDelete')}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setConfirmDelete(false)}
            >
              {t('cancel')}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setConfirmDelete(true)}
          >
            {t('delete')}
          </button>
        )}
      </div>

      {versions.length > 0 && (
        <details>
          <summary className="cursor-pointer font-semibold">
            {t('versions', { count: versions.length })}
          </summary>
          <ul className="mt-3 space-y-2">
            {versions.map((version) => (
              <li
                key={version.id}
                className="flex flex-wrap items-center gap-3 rounded border border-border p-2"
              >
                <span className="grow">
                  v{version.version} · {version.createdAt}
                  {version.note && (
                    <>
                      {' · '}
                      <span dir="auto">{version.note}</span>
                    </>
                  )}
                  {version.isPublished && <strong> · {t('live')}</strong>}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary min-h-10"
                  disabled={pending}
                  onClick={() => run(() => restoreVersion(version.id))}
                >
                  {t('restore')}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
