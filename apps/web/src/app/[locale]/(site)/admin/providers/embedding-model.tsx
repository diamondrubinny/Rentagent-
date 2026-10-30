'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FormMessage } from '@/components/forms';
import { useAction } from '@/components/use-action';
import { setEmbeddingModel } from '../tools/actions';

export function EmbeddingModelSelect({
  models,
  current,
}: {
  models: { id: string; label: string }[];
  current: string | null;
}) {
  const t = useTranslations('AdminAi.embedding');
  const tErrors = useTranslations('AdminAi.errors');
  const [value, setValue] = useState(current ?? '');
  const { pending, outcome, run } = useAction();
  return (
    <section
      aria-labelledby="embedding-title"
      className="space-y-3 rounded-lg border border-border p-4"
    >
      <h2 id="embedding-title" className="text-lg font-bold">
        {t('title')}
      </h2>
      <p className="text-sm text-muted">{t('intro')}</p>
      {models.length === 0 ? (
        <p className="text-sm">{t('none')}</p>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <label className="grow">
            <span className="mb-1 block text-sm font-semibold">{t('model')}</span>
            <select
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="field-input"
            >
              <option value="">{t('choose')}</option>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={pending || !value}
            onClick={() => run(() => setEmbeddingModel(value))}
          >
            {t('save')}
          </button>
        </div>
      )}
      {outcome?.ok && <FormMessage tone="success">{t('saved')}</FormMessage>}
      {outcome && !outcome.ok && <FormMessage tone="error">{tErrors(outcome.error)}</FormMessage>}
      <p className="text-sm text-muted">{t('warning')}</p>
    </section>
  );
}
