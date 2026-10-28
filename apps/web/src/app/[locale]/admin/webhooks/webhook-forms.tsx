'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useState, useTransition } from 'react';
import { FormMessage, SubmitButton, TextField } from '@/components/forms';
import { useRouter } from '@/i18n/navigation';
import {
  createWebhook,
  deleteWebhook,
  redeliver,
  rotateWebhookSecret,
  sendTestEvent,
  setWebhookEnabled,
  type WebhookResult,
} from './actions';

function useWebhookAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<WebhookResult | null>(null);
  const run = (action: () => Promise<WebhookResult>, after?: (result: WebhookResult) => void) =>
    startTransition(async () => {
      const next = await action();
      setResult(next);
      if (next.ok) {
        after?.(next);
        router.refresh();
      }
    });
  return { pending, result, run };
}

/** Shows a newly created/rotated secret once, with a copy button. */
function SecretOnce({ secret }: { secret: string }) {
  const t = useTranslations('AdminWebhooks');
  const [copied, setCopied] = useState(false);
  return (
    <div role="status" className="space-y-2 rounded-lg border-2 border-success bg-success-bg p-4">
      <p className="font-semibold">{t('secretOnce')}</p>
      <code dir="ltr" className="block break-all rounded bg-bg p-2">
        {secret}
      </code>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={async () => {
          await navigator.clipboard.writeText(secret).catch(() => undefined);
          setCopied(true);
        }}
      >
        {copied ? t('copied') : t('copy')}
      </button>
    </div>
  );
}

export function CreateWebhookForm({ events }: { events: string[] }) {
  const t = useTranslations('AdminWebhooks');
  const tValidation = useTranslations('Validation');
  const { pending, result, run } = useWebhookAction();
  const [secret, setSecret] = useState<string | null>(null);
  const fieldErrors = result && !result.ok ? (result.fieldErrors ?? {}) : {};
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    setSecret(null);
    run(
      () =>
        createWebhook({
          url: String(form.get('url') ?? ''),
          description: String(form.get('description') ?? ''),
          events: form.getAll('events').map(String),
        }),
      (next) => {
        if (next.ok && next.secret) setSecret(next.secret);
        element.reset();
      },
    );
  }
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {secret && <SecretOnce secret={secret} />}
      {result && !result.ok && !result.fieldErrors && (
        <FormMessage tone="error">{t(`errors.${result.error}`)}</FormMessage>
      )}
      <TextField
        name="url"
        label={t('url')}
        hint={t('urlHint')}
        type="url"
        dir="ltr"
        required
        error={
          fieldErrors.url
            ? tValidation.has(fieldErrors.url)
              ? tValidation(fieldErrors.url)
              : fieldErrors.url
            : undefined
        }
      />
      <TextField name="description" label={t('description')} dir="auto" maxLength={200} />
      <fieldset aria-describedby={fieldErrors.events ? 'events-error' : undefined}>
        <legend className="mb-2 font-semibold">{t('events')}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {events.map((name) => (
            <label key={name} className="flex items-start gap-2">
              <input type="checkbox" name="events" value={name} className="mt-1 size-5" />
              <span>
                <code dir="ltr">{name}</code>
                <span className="block text-sm text-muted">
                  {t(`event_${name.replace('.', '_')}`)}
                </span>
              </span>
            </label>
          ))}
        </div>
        {fieldErrors.events && (
          <p id="events-error" className="mt-1 text-sm font-semibold text-danger">
            {t('eventsRequired')}
          </p>
        )}
      </fieldset>
      <SubmitButton pending={pending} pendingLabel={t('saving')}>
        {t('add')}
      </SubmitButton>
    </form>
  );
}

export function WebhookActions({ id, enabled }: { id: string; enabled: boolean }) {
  const t = useTranslations('AdminWebhooks');
  const { pending, result, run } = useWebhookAction();
  const [secret, setSecret] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const describedBy = `hook-${id}`;
  return (
    <div className="space-y-3">
      {secret && <SecretOnce secret={secret} />}
      {result?.ok && !secret && (
        <p role="status" className="text-sm text-success">
          {t('done')}
        </p>
      )}
      {result && !result.ok && (
        <FormMessage tone="error">{t(`errors.${result.error}`)}</FormMessage>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-secondary"
          aria-describedby={describedBy}
          disabled={pending}
          onClick={() => run(() => sendTestEvent(id))}
        >
          {t('test')}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          aria-describedby={describedBy}
          disabled={pending}
          onClick={() => run(() => setWebhookEnabled(id, !enabled))}
        >
          {enabled ? t('disable') : t('enable')}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          aria-describedby={describedBy}
          disabled={pending}
          onClick={() =>
            run(
              () => rotateWebhookSecret(id),
              (next) => next.ok && next.secret && setSecret(next.secret),
            )
          }
        >
          {t('rotate')}
        </button>
        {confirmDelete ? (
          <>
            <button
              type="button"
              className="btn btn-primary"
              aria-describedby={describedBy}
              disabled={pending}
              onClick={() => run(() => deleteWebhook(id))}
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
            aria-describedby={describedBy}
            onClick={() => setConfirmDelete(true)}
          >
            {t('delete')}
          </button>
        )}
      </div>
    </div>
  );
}

export function DeliveryRow(props: {
  id: string;
  event: string;
  status: string;
  attempts: number;
  responseStatus: number | null;
  error: string | null;
  when: string;
}) {
  const t = useTranslations('AdminWebhooks');
  const { pending, run } = useWebhookAction();
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span>{props.when}</span>
      <code dir="ltr">{props.event}</code>
      <strong
        className={
          props.status === 'FAILED'
            ? 'text-danger'
            : props.status === 'SUCCEEDED'
              ? 'text-success'
              : ''
        }
      >
        {t(`status_${props.status}`)}
      </strong>
      <span>
        {t('attempts', { count: props.attempts })}
        {props.responseStatus !== null && ` · HTTP ${props.responseStatus}`}
        {props.error && ` · ${props.error}`}
      </span>
      {props.status === 'FAILED' && (
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pending}
          onClick={() => run(() => redeliver(props.id))}
        >
          {t('redeliver')}
        </button>
      )}
    </li>
  );
}
