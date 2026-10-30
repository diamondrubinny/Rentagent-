'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { FormMessage } from '@/components/forms';
import { useAction } from '@/components/use-action';
import { useRouter } from '@/i18n/navigation';
import { deleteKnowledgeSource } from '../actions';

interface SourceView {
  id: string;
  name: string;
  size: number;
  scanStatus: string;
  status: string;
  error: string | null;
  chunks: number;
}

export function KnowledgeSection({
  agentId,
  embeddingConfigured,
  sources,
}: {
  agentId: string;
  embeddingConfigured: boolean;
  sources: SourceView[];
}) {
  const t = useTranslations('AdminAgents.knowledge');
  const tErrors = useTranslations('AdminAgents.errors');
  const format = useFormatter();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<{ tone: 'error' | 'success'; text: string }>();
  const remove = useAction();

  const busy = sources.some(
    (source) => source.status === 'PENDING' || source.status === 'PROCESSING',
  );
  // Poll while files are being scanned or indexed.
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(timer);
  }, [busy, router]);

  async function onUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadMessage(undefined);
    const body = new FormData();
    body.append('file', file);
    const response = await fetch(`/api/admin/agents/${agentId}/knowledge`, {
      method: 'POST',
      body,
    });
    setUploading(false);
    if (response.ok) {
      setUploadMessage({ tone: 'success', text: t('uploaded') });
      event.currentTarget?.reset();
      if (fileRef.current) fileRef.current.value = '';
      router.refresh();
    } else {
      const { error } = (await response.json().catch(() => ({}))) as { error?: string };
      setUploadMessage({ tone: 'error', text: tErrors(`upload_${error ?? 'invalid'}`) });
    }
  }

  return (
    <div className="mt-4 space-y-6">
      <p className="text-muted">{t('intro')}</p>
      {!embeddingConfigured && <FormMessage tone="error">{t('noEmbedding')}</FormMessage>}
      <form
        onSubmit={onUpload}
        className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4"
      >
        <div className="grow">
          <label htmlFor="knowledge-file" className="mb-1 block font-semibold">
            {t('file')}
          </label>
          <p id="knowledge-file-hint" className="mb-1 text-sm text-muted">
            {t('fileHint')}
          </p>
          <input
            ref={fileRef}
            id="knowledge-file"
            type="file"
            accept=".pdf,.txt,.md,.csv,.json,.html,.htm"
            aria-describedby="knowledge-file-hint"
            className="field-input py-2"
            required
          />
        </div>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={uploading}
          aria-busy={uploading}
        >
          {uploading ? t('uploading') : t('upload')}
        </button>
      </form>
      {uploadMessage && <FormMessage tone={uploadMessage.tone}>{uploadMessage.text}</FormMessage>}
      {remove.outcome && !remove.outcome.ok && (
        <FormMessage tone="error">{tErrors(remove.outcome.error)}</FormMessage>
      )}

      {sources.length === 0 ? (
        <p>{t('empty')}</p>
      ) : (
        <ul className="space-y-2" aria-busy={busy}>
          {sources.map((source) => (
            <li
              key={source.id}
              className="flex flex-wrap items-center gap-3 rounded border border-border p-3"
            >
              <span className="grow">
                <span className="block font-semibold" dir="auto">
                  {source.name}
                </span>
                <span className="block text-sm text-muted">
                  {format.number(source.size / 1024, { maximumFractionDigits: 0 })} KB ·{' '}
                  {t(`scan_${source.scanStatus}`)} · {t(`status_${source.status}`)}
                  {source.status === 'READY' && ` · ${t('chunks', { count: source.chunks })}`}
                  {source.error && ` · ${tErrors(`ingest_${source.error}`)}`}
                </span>
              </span>
              <button
                type="button"
                className="btn btn-secondary min-h-10"
                disabled={remove.pending}
                onClick={() => remove.run(() => deleteKnowledgeSource(source.id))}
                aria-label={t('removeLabel', { name: source.name })}
              >
                {t('remove')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p role="status" className="sr-only">
        {busy ? t('processing') : ''}
      </p>
    </div>
  );
}
