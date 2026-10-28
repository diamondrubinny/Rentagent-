'use client';

import { useTranslations } from 'next-intl';
import { type ReactNode, useActionState, useEffect, useRef, useState } from 'react';
import { completeSetup } from './actions';
import { initialSetupState } from './state';

interface SetupFormProps {
  defaults: { defaultLocale: string; timeZone: string; baseCurrency: string };
  locales: { code: string; name: string }[];
  timeZones: string[];
  currencies: string[];
}

interface FieldProps {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  children: (props: {
    id: string;
    name: string;
    'aria-invalid': boolean;
    'aria-describedby'?: string;
  }) => ReactNode;
}

function Field({ name, label, hint, error, children }: FieldProps) {
  const id = `field-${name}`;
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ');
  return (
    <div>
      <label htmlFor={id} className="mb-1 block font-semibold">
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="mb-1 text-sm text-muted">
          {hint}
        </p>
      )}
      {children({
        id,
        name,
        'aria-invalid': Boolean(error),
        'aria-describedby': describedBy || undefined,
      })}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

const FIELD_ORDER = [
  'token',
  'siteName',
  'defaultLocale',
  'timeZone',
  'baseCurrency',
  'licenseKey',
  'smtpHost',
  'smtpPort',
  'smtpSecurity',
  'smtpUser',
  'smtpPassword',
  'smtpFromEmail',
  'smtpFromName',
];

export function SetupForm({ defaults, locales, timeZones, currencies }: SetupFormProps) {
  const t = useTranslations('Setup');
  const tValidation = useTranslations('Validation');
  const [state, formAction, pending] = useActionState(completeSetup, initialSetupState);
  const summaryRef = useRef<HTMLDivElement>(null);
  const values = state.values ?? {};
  const [smtpEnabled, setSmtpEnabled] = useState(values.smtpEnabled === 'on');

  const fieldError = (name: string) => {
    const key = state.fieldErrors?.[name];
    return key ? tValidation(key) : undefined;
  };
  const value = (name: string, fallback = '') => values[name] ?? fallback;

  // Move focus to the error summary so screen-reader and keyboard users hear what went wrong.
  useEffect(() => {
    if (state.status === 'error') summaryRef.current?.focus();
  }, [state]);

  const errorEntries = FIELD_ORDER.filter((name) => state.fieldErrors?.[name]);
  // React resets uncontrolled forms after an action; a new key re-applies the submitted values.
  const formKey = JSON.stringify(values);

  return (
    <form key={formKey} action={formAction} className="mt-8 space-y-10" noValidate>
      {state.status === 'error' && (
        <div
          id="setup-error-summary"
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          className="rounded-lg border-2 border-danger bg-danger-bg p-4"
        >
          {state.formError && <p className="font-semibold">{t(`errors.${state.formError}`)}</p>}
          {errorEntries.length > 0 && (
            <>
              <p className="font-semibold">{t('errorSummary')}</p>
              <ul className="mt-2 list-disc ps-6">
                {errorEntries.map((name) => (
                  <li key={name}>
                    <a className="link" href={`#field-${name}`}>
                      {t(name).replace(/\s*\*$/, '')}: {fieldError(name)}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <fieldset className="space-y-4">
        <legend className="mb-2 text-xl font-bold">{t('sectionAccess')}</legend>
        <Field name="token" label={t('token')} hint={t('tokenHint')} error={fieldError('token')}>
          {(props) => (
            <input
              {...props}
              type="password"
              required
              autoComplete="off"
              spellCheck={false}
              dir="ltr"
              className="field-input font-mono"
            />
          )}
        </Field>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-2 text-xl font-bold">{t('sectionSite')}</legend>
        <Field
          name="siteName"
          label={t('siteName')}
          hint={t('siteNameHint')}
          error={fieldError('siteName')}
        >
          {(props) => (
            <input
              {...props}
              type="text"
              required
              maxLength={80}
              dir="auto"
              autoComplete="organization"
              defaultValue={value('siteName')}
              className="field-input"
            />
          )}
        </Field>
        <Field name="defaultLocale" label={t('defaultLocale')} error={fieldError('defaultLocale')}>
          {(props) => (
            <select
              {...props}
              required
              defaultValue={value('defaultLocale', defaults.defaultLocale)}
              className="field-input"
            >
              {locales.map((locale) => (
                <option key={locale.code} value={locale.code} lang={locale.code}>
                  {locale.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field
          name="timeZone"
          label={t('timeZone')}
          hint={t('timeZoneHint')}
          error={fieldError('timeZone')}
        >
          {(props) => (
            <>
              <input
                {...props}
                type="text"
                required
                list="time-zones"
                dir="ltr"
                autoComplete="off"
                defaultValue={value('timeZone', defaults.timeZone)}
                className="field-input"
              />
              <datalist id="time-zones">
                {timeZones.map((zone) => (
                  <option key={zone} value={zone} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field
          name="baseCurrency"
          label={t('baseCurrency')}
          hint={t('baseCurrencyHint')}
          error={fieldError('baseCurrency')}
        >
          {(props) => (
            <>
              <input
                {...props}
                type="text"
                required
                list="currencies"
                maxLength={3}
                dir="ltr"
                autoComplete="off"
                defaultValue={value('baseCurrency', defaults.baseCurrency)}
                className="field-input uppercase"
              />
              <datalist id="currencies">
                {currencies.map((code) => (
                  <option key={code} value={code} />
                ))}
              </datalist>
            </>
          )}
        </Field>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-2 text-xl font-bold">{t('sectionLicense')}</legend>
        <Field
          name="licenseKey"
          label={t('licenseKey')}
          hint={t('licenseKeyHint')}
          error={fieldError('licenseKey')}
        >
          {(props) => (
            <input
              {...props}
              type="text"
              dir="ltr"
              autoComplete="off"
              spellCheck={false}
              defaultValue={value('licenseKey')}
              className="field-input font-mono"
            />
          )}
        </Field>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-2 text-xl font-bold">{t('sectionMail')}</legend>
        <p className="text-muted">{t('mailIntro')}</p>
        <label className="flex items-center gap-3 font-semibold">
          <input
            type="checkbox"
            name="smtpEnabled"
            className="size-5"
            checked={smtpEnabled}
            onChange={(event) => setSmtpEnabled(event.target.checked)}
            aria-controls="smtp-fields"
            aria-expanded={smtpEnabled}
          />
          {t('smtpEnabled')}
        </label>
        {smtpEnabled && (
          <div id="smtp-fields" className="space-y-4">
            <Field name="smtpHost" label={t('smtpHost')} error={fieldError('smtpHost')}>
              {(props) => (
                <input
                  {...props}
                  type="text"
                  required
                  dir="ltr"
                  autoComplete="off"
                  defaultValue={value('smtpHost')}
                  className="field-input"
                />
              )}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field name="smtpPort" label={t('smtpPort')} error={fieldError('smtpPort')}>
                {(props) => (
                  <input
                    {...props}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={65535}
                    dir="ltr"
                    defaultValue={value('smtpPort', '587')}
                    className="field-input"
                  />
                )}
              </Field>
              <Field
                name="smtpSecurity"
                label={t('smtpSecurity')}
                error={fieldError('smtpSecurity')}
              >
                {(props) => (
                  <select
                    {...props}
                    defaultValue={value('smtpSecurity', 'starttls')}
                    className="field-input"
                  >
                    <option value="starttls">{t('smtpSecurityStarttls')}</option>
                    <option value="tls">{t('smtpSecurityTls')}</option>
                    <option value="none">{t('smtpSecurityNone')}</option>
                  </select>
                )}
              </Field>
            </div>
            <Field name="smtpUser" label={t('smtpUser')} error={fieldError('smtpUser')}>
              {(props) => (
                <input
                  {...props}
                  type="text"
                  dir="ltr"
                  autoComplete="off"
                  defaultValue={value('smtpUser')}
                  className="field-input"
                />
              )}
            </Field>
            <Field
              name="smtpPassword"
              label={t('smtpPassword')}
              hint={t('smtpPasswordHint')}
              error={fieldError('smtpPassword')}
            >
              {(props) => (
                <input
                  {...props}
                  type="password"
                  dir="ltr"
                  autoComplete="new-password"
                  className="field-input"
                />
              )}
            </Field>
            <Field
              name="smtpFromEmail"
              label={t('smtpFromEmail')}
              error={fieldError('smtpFromEmail')}
            >
              {(props) => (
                <input
                  {...props}
                  type="email"
                  required
                  dir="ltr"
                  autoComplete="off"
                  defaultValue={value('smtpFromEmail')}
                  className="field-input"
                />
              )}
            </Field>
            <Field name="smtpFromName" label={t('smtpFromName')} error={fieldError('smtpFromName')}>
              {(props) => (
                <input
                  {...props}
                  type="text"
                  dir="auto"
                  autoComplete="off"
                  defaultValue={value('smtpFromName')}
                  className="field-input"
                />
              )}
            </Field>
          </div>
        )}
      </fieldset>

      <button type="submit" className="btn btn-primary" disabled={pending} aria-disabled={pending}>
        {pending ? t('submitting') : t('submit')}
      </button>
    </form>
  );
}
