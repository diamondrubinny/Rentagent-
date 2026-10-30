'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useState, useTransition } from 'react';
import { FormMessage, SubmitButton, TextField } from '@/components/forms';
import { useRouter } from '@/i18n/navigation';
import { type LegalResult, saveLegalDetails, saveLegalPage } from './actions';

function useResult() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<LegalResult | null>(null);
  const run = (action: () => Promise<LegalResult>) =>
    startTransition(async () => {
      const next = await action();
      setResult(next);
      if (next.ok) router.refresh();
    });
  return { pending, result, run };
}

const DETAIL_FIELDS = [
  { name: 'company', autoComplete: 'organization' },
  { name: 'address', autoComplete: 'street-address' },
  { name: 'country', autoComplete: 'country-name' },
  { name: 'contactEmail', type: 'email', autoComplete: 'email' },
  { name: 'privacyEmail', type: 'email' },
  { name: 'dpoName' },
  { name: 'accessibilityName' },
  { name: 'accessibilityEmail', type: 'email' },
  { name: 'accessibilityPhone', type: 'tel' },
  { name: 'accessibilityResponseDays', type: 'number' },
] as const;

export type LegalDetails = Record<(typeof DETAIL_FIELDS)[number]['name'], string>;

export function DetailsForm({ values }: { values: LegalDetails }) {
  const t = useTranslations('AdminLegal');
  const tv = useTranslations('Validation');
  const { pending, result, run } = useResult();
  const fieldErrors = result && !result.ok ? (result.fieldErrors ?? {}) : {};
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      noValidate
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const input = Object.fromEntries(
          DETAIL_FIELDS.map(({ name }) => [name, String(form.get(name) ?? '')]),
        ) as LegalDetails;
        run(() => saveLegalDetails(input));
      }}
    >
      <div className="sm:col-span-2">
        {result?.ok && <FormMessage tone="success">{t('saved')}</FormMessage>}
        {result && !result.ok && (
          <FormMessage tone="error">{t(`errors.${result.error}`)}</FormMessage>
        )}
      </div>
      {DETAIL_FIELDS.map((field) => (
        <TextField
          key={field.name}
          name={field.name}
          label={t(`field_${field.name}`)}
          hint={t.has(`field_${field.name}Hint`) ? t(`field_${field.name}Hint`) : undefined}
          type={'type' in field ? field.type : 'text'}
          autoComplete={'autoComplete' in field ? field.autoComplete : 'off'}
          defaultValue={values[field.name]}
          dir={'type' in field ? 'ltr' : undefined}
          {...(field.name === 'accessibilityResponseDays' ? { min: 1, max: 90 } : {})}
          error={fieldErrors[field.name] ? tv(fieldErrors[field.name]!) : undefined}
        />
      ))}
      <div className="sm:col-span-2">
        <SubmitButton pending={pending} pendingLabel={t('saving')}>
          {t('save')}
        </SubmitButton>
      </div>
    </form>
  );
}

export function PageForm({
  page,
  reviewed,
  locales,
  overrides,
  maxChars,
}: {
  page: string;
  reviewed: boolean;
  locales: { code: string; name: string; dir: 'ltr' | 'rtl' }[];
  overrides: Record<string, string>;
  maxChars: number;
}) {
  const t = useTranslations('AdminLegal');
  const tv = useTranslations('Validation');
  const { pending, result, run } = useResult();
  const fieldErrors = result && !result.ok ? (result.fieldErrors ?? {}) : {};
  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        run(() =>
          saveLegalPage({
            page,
            reviewed: form.get('reviewed') === 'on',
            overrides: Object.fromEntries(
              locales.map(({ code }) => [code, String(form.get(`text-${code}`) ?? '')]),
            ),
          }),
        );
      }}
    >
      {result?.ok && <FormMessage tone="success">{t('saved')}</FormMessage>}
      {result && !result.ok && (
        <FormMessage tone="error">{t(`errors.${result.error}`)}</FormMessage>
      )}
      {locales.map((locale) => {
        const id = `legal-${page}-${locale.code}`;
        const error = fieldErrors[locale.code];
        return (
          <details key={locale.code} open={Boolean(overrides[locale.code]) || Boolean(error)}>
            <summary className="cursor-pointer font-semibold">
              {t('customText', { language: locale.name })}
              {overrides[locale.code] ? ` — ${t('customInUse')}` : ''}
            </summary>
            <div className="mt-2 space-y-1">
              <label htmlFor={id} className="block text-sm">
                {t('customLabel', { language: locale.name })}
              </label>
              <p id={`${id}-hint`} className="text-sm text-muted">
                {t('customHint')}
              </p>
              <textarea
                id={id}
                name={`text-${locale.code}`}
                defaultValue={overrides[locale.code] ?? ''}
                dir={locale.dir}
                lang={locale.code}
                rows={10}
                maxLength={maxChars}
                className="field-input font-mono text-sm"
                aria-invalid={Boolean(error)}
                aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
              />
              {error && (
                <p id={`${id}-error`} className="text-sm font-semibold text-danger">
                  {tv(error)}
                </p>
              )}
            </div>
          </details>
        );
      })}
      <label className="flex items-start gap-3">
        <input type="checkbox" name="reviewed" defaultChecked={reviewed} className="mt-1 size-5" />
        <span>
          <span className="block font-semibold">{t('reviewed')}</span>
          <span className="block text-sm text-muted">{t('reviewedHint')}</span>
        </span>
      </label>
      <SubmitButton pending={pending} pendingLabel={t('saving')}>
        {t('save')}
      </SubmitButton>
    </form>
  );
}
