'use client';

import { checkPrimaryColor, isHexColor } from '@rentagent/shared';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState, useTransition } from 'react';
import { FormMessage, SubmitButton } from '@/components/forms';
import { useRouter } from '@/i18n/navigation';
import {
  type BrandingResult,
  removeBrandImage,
  saveColors,
  saveFeatures,
  uploadBrandImage,
} from './actions';

function useResult() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<BrandingResult | null>(null);
  const run = (action: () => Promise<BrandingResult>, after?: () => void) =>
    startTransition(async () => {
      const next = await action();
      setResult(next);
      if (next.ok) {
        after?.();
        router.refresh();
      }
    });
  return { pending, result, run };
}

function ColorField({
  name,
  label,
  theme,
  value,
  onChange,
  error,
}: {
  name: string;
  label: string;
  theme: 'light' | 'dark';
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const t = useTranslations('AdminBranding');
  const valid = isHexColor(value.toLowerCase());
  const check = valid ? checkPrimaryColor(value.toLowerCase(), theme) : null;
  const surface = theme === 'light' ? '#ffffff' : '#0f1115';
  return (
    <div className="space-y-2">
      <label htmlFor={`color-${name}`} className="block font-semibold">
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <input
          id={`color-${name}`}
          name={name}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="#1d4ed8"
          dir="ltr"
          maxLength={7}
          className="field-input max-w-40 font-mono"
          aria-invalid={Boolean(error)}
          aria-describedby={`color-${name}-status${error ? ` color-${name}-error` : ''}`}
        />
        <input
          type="color"
          value={valid ? value.toLowerCase() : '#1d4ed8'}
          onChange={(event) => onChange(event.target.value)}
          aria-label={t('picker', { label })}
          className="h-11 w-14 cursor-pointer rounded border border-border"
        />
        {check && (
          <span
            className="rounded px-3 py-2"
            style={{
              background: value.toLowerCase(),
              color: check.foreground,
              outline: `4px solid ${surface}`,
            }}
            aria-hidden="true"
          >
            {t('sample')}
          </span>
        )}
      </div>
      <p id={`color-${name}-status`} className="text-sm">
        {!value
          ? t('defaultColor')
          : !check
            ? t('enterHex')
            : t(check.ok ? 'contrastOk' : 'contrastLow', {
                page: check.onBackground.toFixed(1),
                button: check.buttonText.toFixed(1),
              })}
      </p>
      {error && (
        <p id={`color-${name}-error`} className="text-sm font-semibold text-danger">
          {t(`errors.${error}`)}
        </p>
      )}
    </div>
  );
}

export function ColorsForm({
  primaryLight,
  primaryDark,
}: {
  primaryLight: string;
  primaryDark: string;
}) {
  const t = useTranslations('AdminBranding');
  const { pending, result, run } = useResult();
  const [light, setLight] = useState(primaryLight);
  const [dark, setDark] = useState(primaryDark);
  const fieldErrors = result && !result.ok ? (result.fieldErrors ?? {}) : {};
  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        run(() => saveColors({ primaryLight: light, primaryDark: dark }));
      }}
    >
      {result?.ok && <FormMessage tone="success">{t('saved')}</FormMessage>}
      {result && !result.ok && (
        <FormMessage tone="error">{t(`errors.${result.error}`)}</FormMessage>
      )}
      <ColorField
        name="primaryLight"
        label={t('primaryLight')}
        theme="light"
        value={light}
        onChange={setLight}
        error={fieldErrors.primaryLight}
      />
      <ColorField
        name="primaryDark"
        label={t('primaryDark')}
        theme="dark"
        value={dark}
        onChange={setDark}
        error={fieldErrors.primaryDark}
      />
      <SubmitButton pending={pending} pendingLabel={t('saving')}>
        {t('save')}
      </SubmitButton>
    </form>
  );
}

export function ImageForm({ kind, current }: { kind: 'logo' | 'favicon'; current: string | null }) {
  const t = useTranslations('AdminBranding');
  const { pending, result, run } = useResult();
  return (
    <div className="space-y-3">
      {result?.ok && <FormMessage tone="success">{t('saved')}</FormMessage>}
      {result && !result.ok && (
        <FormMessage tone="error">{t(`errors.${result.error}`)}</FormMessage>
      )}
      {current && (
        <p className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- operator upload, already optimized size */}
          <img
            src={current}
            alt={t(`${kind}Current`)}
            className="max-h-16 rounded border border-border bg-surface p-1"
          />
          <button
            type="button"
            className="btn btn-secondary"
            disabled={pending}
            onClick={() => run(() => removeBrandImage(kind))}
          >
            {t('remove')}
          </button>
        </p>
      )}
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          const element = event.currentTarget;
          const data = new FormData(element);
          run(
            () => uploadBrandImage(kind, data),
            () => element.reset(),
          );
        }}
      >
        <div>
          <label htmlFor={`${kind}-file`} className="mb-1 block font-semibold">
            {t('chooseFile')}
          </label>
          <p id={`${kind}-hint`} className="mb-1 text-sm text-muted">
            {t(`${kind}Hint`)}
          </p>
          <input
            id={`${kind}-file`}
            name="file"
            type="file"
            accept={
              kind === 'favicon'
                ? 'image/png,image/x-icon,image/webp'
                : 'image/png,image/jpeg,image/webp'
            }
            aria-describedby={`${kind}-hint`}
            className="field-input py-2"
          />
        </div>
        <SubmitButton pending={pending} pendingLabel={t('uploading')}>
          {t('upload')}
        </SubmitButton>
      </form>
    </div>
  );
}

export function FeaturesForm({
  feedback,
  semanticSearch,
  a11yWidget,
  publicApi,
  hidePoweredBy,
  whiteLabel,
}: {
  feedback: boolean;
  semanticSearch: boolean;
  a11yWidget: boolean;
  publicApi: boolean;
  hidePoweredBy: boolean;
  /** The license allows removing the credit line. */
  whiteLabel: boolean;
}) {
  const t = useTranslations('AdminBranding');
  const { pending, result, run } = useResult();
  return (
    <form
      className="space-y-4"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        run(() =>
          saveFeatures({
            feedback: form.get('feedback') === 'on',
            semanticSearch: form.get('semanticSearch') === 'on',
            a11yWidget: form.get('a11yWidget') === 'on',
            publicApi: form.get('publicApi') === 'on',
            hidePoweredBy: form.get('hidePoweredBy') === 'on',
          }),
        );
      }}
    >
      {result?.ok && <FormMessage tone="success">{t('saved')}</FormMessage>}
      {result && !result.ok && (
        <FormMessage tone="error">{t(`errors.${result.error}`)}</FormMessage>
      )}
      {(['feedback', 'semanticSearch', 'a11yWidget', 'publicApi', 'hidePoweredBy'] as const).map(
        (name) => (
          <label key={name} className="flex items-start gap-3">
            <input
              type="checkbox"
              name={name}
              defaultChecked={
                { feedback, semanticSearch, a11yWidget, publicApi, hidePoweredBy }[name]
              }
              className="mt-1 size-5"
            />
            <span>
              <span className="block font-semibold">{t(`feature_${name}`)}</span>
              <span className="block text-sm text-muted">{t(`feature_${name}Hint`)}</span>
              {name === 'hidePoweredBy' && !whiteLabel && (
                <span className="block text-sm font-semibold">{t('needsWhiteLabel')}</span>
              )}
            </span>
          </label>
        ),
      )}
      <SubmitButton pending={pending} pendingLabel={t('saving')}>
        {t('save')}
      </SubmitButton>
    </form>
  );
}
