'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useRef, useState, useTransition } from 'react';
import { FormMessage, SubmitButton, TextField } from '@/components/forms';
import { useRouter } from '@/i18n/navigation';
import { type ApiKeyResult, createApiKey, createWidgetKey, revokeApiKey } from './actions';

const SCOPES = ['agents:read', 'conversations:write', 'approvals:write'] as const;
const EXPIRY = [90, 30, 365, 0] as const;

export function CreateKeyForm({ agents }: { agents: { id: string; name: string }[] }) {
  const t = useTranslations('ApiKeys');
  const tValidation = useTranslations('Validation');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ApiKeyResult | null>(null);
  const [copied, setCopied] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const tokenRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (result?.ok && result.token) tokenRef.current?.select();
  }, [result]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const next = await createApiKey({
        name: String(form.get('name') ?? ''),
        scopes: form.getAll('scopes').map(String),
        agentIds: form.getAll('agentIds').map(String),
        expiresInDays: Number(form.get('expiresInDays') ?? 90),
      });
      setResult(next);
      setCopied(false);
      if (next.ok) {
        formRef.current?.reset();
        router.refresh();
      }
    });
  }

  const fieldErrors = result && !result.ok ? (result.fieldErrors ?? {}) : {};
  const error = (name: string) => (fieldErrors[name] ? tValidation(fieldErrors[name]) : undefined);
  return (
    <div className="space-y-6">
      {result?.ok && result.token && (
        <div role="status" className="space-y-3 rounded-lg border border-success bg-success-bg p-4">
          <p className="font-semibold">{t('createdTitle')}</p>
          <p>{t('createdHint')}</p>
          <label htmlFor="new-api-key" className="block text-sm font-semibold">
            {t('newKey')}
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              ref={tokenRef}
              id="new-api-key"
              readOnly
              value={result.token}
              dir="ltr"
              className="field-input min-w-0 flex-1 font-mono text-sm"
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(result.token!);
                  setCopied(true);
                } catch {
                  tokenRef.current?.select();
                }
              }}
            >
              {copied ? t('copied') : t('copy')}
            </button>
          </div>
        </div>
      )}
      <form ref={formRef} onSubmit={onSubmit} className="space-y-5" noValidate>
        {result && !result.ok && (
          <FormMessage tone="error">{t(`errors.${result.error}`)}</FormMessage>
        )}
        <TextField
          name="name"
          label={t('name')}
          hint={t('nameHint')}
          maxLength={80}
          error={error('name')}
        />
        <fieldset aria-describedby={fieldErrors.scopes ? 'scopes-error' : undefined}>
          <legend className="mb-2 font-semibold">{t('scopes')}</legend>
          <div className="space-y-2">
            {SCOPES.map((scope) => (
              <label key={scope} className="flex items-start gap-3">
                <input
                  type="checkbox"
                  name="scopes"
                  value={scope}
                  defaultChecked
                  className="mt-1 size-5"
                />
                <span>
                  <span className="block font-mono text-sm" dir="ltr">
                    {scope}
                  </span>
                  <span className="block text-sm text-muted">
                    {t(`scope_${scope.replace(':', '_')}`)}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {fieldErrors.scopes && (
            <p id="scopes-error" className="mt-1 text-sm font-semibold text-danger">
              {tValidation(fieldErrors.scopes)}
            </p>
          )}
        </fieldset>
        {agents.length > 0 && (
          <fieldset>
            <legend className="mb-1 font-semibold">{t('agents')}</legend>
            <p className="mb-2 text-sm text-muted">{t('agentsHint')}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {agents.map((agent) => (
                <label key={agent.id} className="flex items-center gap-3">
                  <input type="checkbox" name="agentIds" value={agent.id} className="size-5" />
                  <span dir="auto">{agent.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div>
          <label htmlFor="api-key-expiry" className="mb-1 block font-semibold">
            {t('expiry')}
          </label>
          <select
            id="api-key-expiry"
            name="expiresInDays"
            defaultValue="90"
            className="field-input max-w-xs"
          >
            {EXPIRY.map((days) => (
              <option key={days} value={days}>
                {days ? t('expiryDays', { days }) : t('expiryNever')}
              </option>
            ))}
          </select>
        </div>
        <SubmitButton pending={pending} pendingLabel={t('creating')}>
          {t('create')}
        </SubmitButton>
      </form>
    </div>
  );
}

/** Two-step revoke: the first press asks for confirmation in place. */
export function RevokeKeyButton({ id, describedBy }: { id: string; describedBy: string }) {
  const t = useTranslations('ApiKeys');
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);
  if (!confirming)
    return (
      <button
        type="button"
        className="btn btn-secondary"
        aria-describedby={describedBy}
        onClick={() => setConfirming(true)}
      >
        {t('revoke')}
      </button>
    );
  return (
    <div role="group" aria-describedby={describedBy} className="flex flex-wrap items-center gap-2">
      <span>{t('revokeConfirm')}</span>
      <button
        ref={confirmRef}
        type="button"
        className="btn btn-primary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await revokeApiKey(id);
            if (result.ok) router.refresh();
            else setFailed(true);
          })
        }
      >
        {t('revokeYes')}
      </button>
      <button type="button" className="btn btn-secondary" onClick={() => setConfirming(false)}>
        {t('cancel')}
      </button>
      {failed && (
        <span role="alert" className="text-danger">
          {t('errors.notFound')}
        </span>
      )}
    </div>
  );
}

/** Creates a website widget key and shows the snippet to paste into the site. */
export function CreateWidgetForm({
  agents,
  siteUrl,
  locale,
}: {
  agents: { id: string; name: string }[];
  siteUrl: string;
  locale: string;
}) {
  const t = useTranslations('ApiKeys');
  const tValidation = useTranslations('Validation');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ApiKeyResult | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const next = await createWidgetKey({
        name: String(form.get('name') ?? ''),
        agentId: String(form.get('agentId') ?? ''),
        origins: String(form.get('origins') ?? ''),
        dailyRunLimit: String(form.get('dailyRunLimit') ?? ''),
      });
      setResult(next);
      if (next.ok) {
        formRef.current?.reset();
        router.refresh();
      }
    });
  }

  const fieldErrors = result && !result.ok ? (result.fieldErrors ?? {}) : {};
  const error = (name: string) => (fieldErrors[name] ? tValidation(fieldErrors[name]) : undefined);
  return (
    <div className="space-y-6">
      {result?.ok && result.token && (
        <div role="status" className="space-y-2 rounded-lg border border-success bg-success-bg p-4">
          <p className="font-semibold">{t('widgetCreated')}</p>
          <WidgetSnippet token={result.token} siteUrl={siteUrl} locale={locale} />
        </div>
      )}
      <form ref={formRef} onSubmit={onSubmit} className="space-y-5" noValidate>
        {result && !result.ok && (
          <FormMessage tone="error">{t(`errors.${result.error}`)}</FormMessage>
        )}
        <TextField name="name" label={t('name')} maxLength={80} error={error('name')} />
        <div>
          <label htmlFor="widget-agent" className="mb-1 block font-semibold">
            {t('widgetAgent')}
          </label>
          <select
            id="widget-agent"
            name="agentId"
            className="field-input"
            aria-invalid={Boolean(fieldErrors.agentId)}
            aria-describedby={fieldErrors.agentId ? 'widget-agent-error' : undefined}
          >
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
          {fieldErrors.agentId && (
            <p id="widget-agent-error" className="mt-1 text-sm font-semibold text-danger">
              {tValidation(fieldErrors.agentId)}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="widget-origins" className="mb-1 block font-semibold">
            {t('widgetOrigins')}
          </label>
          <p id="widget-origins-hint" className="mb-1 text-sm text-muted">
            {t('widgetOriginsHint')}
          </p>
          <textarea
            id="widget-origins"
            name="origins"
            rows={3}
            dir="ltr"
            placeholder="https://www.example.com"
            className="field-input font-mono text-sm"
            aria-invalid={Boolean(fieldErrors.origins)}
            aria-describedby={`widget-origins-hint${fieldErrors.origins ? ' widget-origins-error' : ''}`}
          />
          {fieldErrors.origins && (
            <p id="widget-origins-error" className="mt-1 text-sm font-semibold text-danger">
              {tValidation(fieldErrors.origins)}
            </p>
          )}
        </div>
        <TextField
          name="dailyRunLimit"
          label={t('widgetDailyLimit')}
          hint={t('widgetDailyLimitHint')}
          type="number"
          min={1}
          max={100000}
          defaultValue="100"
          error={error('dailyRunLimit')}
        />
        <SubmitButton pending={pending} pendingLabel={t('creating')}>
          {t('widgetCreate')}
        </SubmitButton>
      </form>
    </div>
  );
}

/** The code to paste before </body> on the allowed sites. */
export function WidgetSnippet({
  token,
  siteUrl,
  locale,
}: {
  token: string;
  siteUrl: string;
  locale: string;
}) {
  const t = useTranslations('ApiKeys');
  const [copied, setCopied] = useState(false);
  const code = `<script src="${siteUrl}/embed.js" data-key="${token}" data-locale="${locale}" data-label="${t('widgetDefaultLabel')}" async></script>`;
  const id = `snippet-${token.slice(-8)}`;
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold">
        {t('widgetSnippet')}
      </label>
      <textarea
        id={id}
        readOnly
        value={code}
        rows={3}
        dir="ltr"
        className="field-input font-mono text-xs"
        onFocus={(event) => event.currentTarget.select()}
      />
      <button
        type="button"
        className="btn btn-secondary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
          } catch {
            document.getElementById(id)?.focus();
          }
        }}
      >
        {copied ? t('copied') : t('copy')}
      </button>
    </div>
  );
}
