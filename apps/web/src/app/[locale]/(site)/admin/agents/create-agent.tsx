'use client';

import { useTranslations } from 'next-intl';
import { type ChangeEvent, useState } from 'react';
import { FormMessage } from '@/components/forms';
import { useAction } from '@/components/use-action';
import { useRouter } from '@/i18n/navigation';
import { createAgent, importAgent } from './actions';

interface TemplateView {
  key: string;
  name: string;
  description: string;
  category: string;
}

export function CreateAgent({ templates }: { templates: TemplateView[] }) {
  const t = useTranslations('AdminAgents');
  const tErrors = useTranslations('AdminAgents.errors');
  const router = useRouter();
  const create = useAction();
  const importing = useAction();
  const [json, setJson] = useState('');

  const open = (result: { id?: string }) => router.push(`/admin/agents/${result.id}`);
  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.size <= 200_000) setJson(await file.text());
  };

  return (
    <div className="space-y-8">
      <section aria-labelledby="templates-title" className="space-y-4">
        <h2 id="templates-title" className="text-2xl font-bold">
          {t('create.templatesTitle')}
        </h2>
        {create.outcome && !create.outcome.ok && (
          <FormMessage tone="error">{tErrors(create.outcome.error)}</FormMessage>
        )}
        <ul className="grid gap-4 sm:grid-cols-2">
          {templates.map((template) => (
            <li key={template.key} className="flex flex-col rounded-lg border border-border p-4">
              <h3 className="font-bold" dir="auto">
                {template.name}
              </h3>
              <p className="text-sm text-muted">{t(`categories.${template.category}`)}</p>
              <p className="mt-2 grow text-sm" dir="auto">
                {template.description}
              </p>
              <button
                type="button"
                className="btn btn-secondary mt-3 self-start"
                disabled={create.pending}
                onClick={() => create.run(() => createAgent(template.key), open)}
                aria-label={t('create.useTemplateLabel', { name: template.name })}
              >
                {t('create.useTemplate')}
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="btn btn-primary"
          disabled={create.pending}
          onClick={() => create.run(() => createAgent(null), open)}
        >
          {t('create.blank')}
        </button>
      </section>

      <section
        aria-labelledby="import-title"
        className="space-y-4 rounded-lg border border-border p-6"
      >
        <h2 id="import-title" className="text-2xl font-bold">
          {t('create.importTitle')}
        </h2>
        <p className="text-muted">{t('create.importIntro')}</p>
        {importing.outcome && !importing.outcome.ok && (
          <FormMessage tone="error">{tErrors(importing.outcome.error)}</FormMessage>
        )}
        <div>
          <label htmlFor="import-file" className="mb-1 block font-semibold">
            {t('create.importFile')}
          </label>
          <input
            id="import-file"
            type="file"
            accept=".json,application/json"
            onChange={onFile}
            className="field-input py-2"
          />
        </div>
        <div>
          <label htmlFor="import-json" className="mb-1 block font-semibold">
            {t('create.importJson')}
          </label>
          <textarea
            id="import-json"
            rows={6}
            value={json}
            onChange={(event) => setJson(event.target.value)}
            dir="ltr"
            className="field-input py-2 font-mono text-sm"
            spellCheck={false}
          />
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={importing.pending || !json.trim()}
          onClick={() => importing.run(() => importAgent(json), open)}
        >
          {t('create.import')}
        </button>
      </section>
    </div>
  );
}
