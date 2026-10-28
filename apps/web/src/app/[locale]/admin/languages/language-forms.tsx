'use client';

import type { TranslationJobProgress } from '@rentagent/core';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { FormMessage, SubmitButton } from '@/components/forms';
import { useAction } from '@/components/use-action';
import { useRouter } from '@/i18n/navigation';
import {
  disableLocale,
  enableLocale,
  setDefaultLocale,
  translateMissing,
  translationProgress,
} from './actions';

/** Polls the background translation job while it runs. */
export function TranslationProgress({ code }: { code: string }) {
  const t = useTranslations('AdminLanguages');
  const router = useRouter();
  const [progress, setProgress] = useState<TranslationJobProgress | null>(null);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const next = await translationProgress(code);
      if (stopped) return;
      setProgress(next);
      if (next?.status === 'running') timer = setTimeout(tick, 2000);
      else if (next) router.refresh();
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [code, router]);
  if (!progress) return null;
  return (
    <p role="status" className="text-sm">
      {progress.status === 'running'
        ? t('jobRunning', { done: progress.translated + progress.rejected, total: progress.total })
        : progress.status === 'done'
          ? t('jobDone', { translated: progress.translated, rejected: progress.rejected })
          : t('jobFailed')}
    </p>
  );
}

export function LanguageActions({
  code,
  name,
  enabled,
  isDefault,
  canTranslate,
}: {
  code: string;
  name: string;
  enabled: boolean;
  isDefault: boolean;
  canTranslate: boolean;
}) {
  const t = useTranslations('AdminLanguages');
  const router = useRouter();
  const { pending, outcome, run } = useAction();
  const [started, setStarted] = useState(false);
  const done = () => router.refresh();
  return (
    <>
      {enabled && !isDefault && (
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pending}
          onClick={() => run(() => setDefaultLocale(code), done)}
        >
          {t('makeDefault', { name })}
        </button>
      )}
      {enabled && !isDefault && (
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pending}
          onClick={() => run(() => disableLocale(code), done)}
        >
          {t('disable', { name })}
        </button>
      )}
      {!enabled && (
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pending}
          onClick={() => run(() => enableLocale(code, false), done)}
        >
          {t('enable', { name })}
        </button>
      )}
      {canTranslate && (
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pending}
          onClick={() =>
            run(
              () => translateMissing(code),
              () => setStarted(true),
            )
          }
        >
          {t('translateMissing', { name })}
        </button>
      )}
      {(started || canTranslate) && <TranslationProgress key={String(started)} code={code} />}
      {outcome && !outcome.ok && (
        <span role="alert" className="text-danger">
          {t(`errors.${outcome.error}`)}
        </span>
      )}
    </>
  );
}

export function AddLanguageForm({ available }: { available: { code: string; name: string }[] }) {
  const t = useTranslations('AdminLanguages');
  const router = useRouter();
  const { pending, outcome, run } = useAction();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const code = String(form.get('code') ?? '');
    run(
      () => enableLocale(code, form.get('autoTranslate') === 'on'),
      () => router.refresh(),
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-4">
      {outcome?.ok && <FormMessage tone="success">{t('added')}</FormMessage>}
      {outcome && !outcome.ok && (
        <FormMessage tone="error">{t(`errors.${outcome.error}`)}</FormMessage>
      )}
      <div>
        <label htmlFor="add-language" className="mb-1 block font-semibold">
          {t('language')}
        </label>
        <select id="add-language" name="code" className="field-input" required>
          {available.map((language) => (
            <option key={language.code} value={language.code} lang={language.code}>
              {language.name} ({language.code})
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 pb-2">
        <input type="checkbox" name="autoTranslate" defaultChecked className="size-5" />
        {t('autoTranslate')}
      </label>
      <SubmitButton pending={pending} pendingLabel={t('adding')}>
        {t('add')}
      </SubmitButton>
    </form>
  );
}
