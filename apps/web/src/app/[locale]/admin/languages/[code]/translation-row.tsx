'use client';

import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { useAction } from '@/components/use-action';
import { useRouter } from '@/i18n/navigation';
import { markReviewed, resetTranslation, saveTranslation } from '../actions';

export interface RowState {
  key: string;
  source: string;
  value: string;
  state: 'builtin' | 'reviewed' | 'auto' | 'missing';
}

export function TranslationRow({
  code,
  dir,
  row,
}: {
  code: string;
  dir: 'ltr' | 'rtl';
  row: RowState;
}) {
  const t = useTranslations('AdminLanguages');
  const router = useRouter();
  const id = useId();
  const [value, setValue] = useState(row.value);
  // When the server value changes (save, reset, refresh), show it; edits in progress stay otherwise.
  const [serverValue, setServerValue] = useState(row.value);
  if (serverValue !== row.value) {
    setServerValue(row.value);
    setValue(row.value);
  }
  const labelId = `${id}-label`;
  const { pending, outcome, run, reset } = useAction();
  const done = () => router.refresh();
  const errorId = `${id}-error`;

  return (
    <li
      className={`rounded-lg border p-4 ${row.state === 'auto' ? 'border-danger' : 'border-border'}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label id={labelId} htmlFor={id} className="font-semibold">
          <code dir="ltr">{row.key}</code>
        </label>
        <span className="text-sm">{t(`state_${row.state}`)}</span>
      </div>
      <p className="mt-1 text-sm text-muted" lang="en" dir="ltr">
        <span className="sr-only">{t('english')}: </span>
        {row.source}
      </p>
      <textarea
        id={id}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          reset();
        }}
        rows={Math.min(6, Math.max(2, Math.ceil(row.source.length / 80)))}
        lang={code}
        dir={dir}
        maxLength={5000}
        className="field-input mt-2 py-2"
        aria-invalid={Boolean(outcome && !outcome.ok)}
        aria-describedby={outcome && !outcome.ok ? errorId : undefined}
      />
      {outcome && !outcome.ok && (
        <p id={errorId} role="alert" className="mt-1 text-sm font-semibold text-danger">
          {t(`errors.${outcome.error}`)}
        </p>
      )}
      {outcome?.ok && (
        <p role="status" className="mt-1 text-sm text-success">
          {t('saved')}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          aria-describedby={labelId}
          onClick={() => run(() => saveTranslation(code, row.key, value), done)}
        >
          {t('save')}
        </button>
        {row.state === 'auto' && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={pending}
            aria-describedby={labelId}
            onClick={() => run(() => markReviewed(code, [row.key]), done)}
          >
            {t('markReviewed')}
          </button>
        )}
        {(row.state === 'auto' || row.state === 'reviewed') && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={pending}
            aria-describedby={labelId}
            onClick={() => run(() => resetTranslation(code, row.key), done)}
          >
            {t('reset')}
          </button>
        )}
      </div>
    </li>
  );
}
