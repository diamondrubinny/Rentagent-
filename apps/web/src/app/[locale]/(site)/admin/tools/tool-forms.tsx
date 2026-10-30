'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import { FormMessage, SubmitButton, TextField } from '@/components/forms';
import { useAction } from '@/components/use-action';
import {
  deleteHttpTool,
  deleteMcpServer,
  refreshMcpTools,
  saveHttpTool,
  saveMcpServer,
} from './actions';

const EXAMPLE_SCHEMA = JSON.stringify(
  {
    type: 'object',
    properties: { orderId: { type: 'string', description: 'Order number' } },
    required: ['orderId'],
  },
  null,
  2,
);

interface HttpToolView {
  id: string;
  name: string;
  description: string;
  method: string;
  urlTemplate: string;
  inputSchema: string;
  hasHeaders: boolean;
  enabled: boolean;
}

function DeleteButton({ onConfirm, pending }: { onConfirm: () => void; pending: boolean }) {
  const t = useTranslations('AdminTools');
  const [confirming, setConfirming] = useState(false);
  return confirming ? (
    <>
      <button
        type="button"
        className="btn bg-danger text-primary-fg"
        disabled={pending}
        onClick={onConfirm}
      >
        {t('confirmDelete')}
      </button>
      <button type="button" className="btn btn-secondary" onClick={() => setConfirming(false)}>
        {t('cancel')}
      </button>
    </>
  ) : (
    <button type="button" className="btn btn-secondary" onClick={() => setConfirming(true)}>
      {t('delete')}
    </button>
  );
}

export function HttpToolForm({ tool }: { tool: HttpToolView | null }) {
  const t = useTranslations('AdminTools');
  const tErrors = useTranslations('AdminAgents.errors');
  const tValidation = useTranslations('Validation');
  const id = useId();
  const { pending, outcome, run, fieldErrors } = useAction();
  const [formKey, setFormKey] = useState(0);
  const error = (name: string) =>
    fieldErrors[name]
      ? tValidation.has(fieldErrors[name])
        ? tValidation(fieldErrors[name])
        : fieldErrors[name]
      : undefined;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input: Record<string, string | boolean> = {};
    for (const [key, value] of form.entries()) input[key] = String(value);
    input.enabled = form.get('enabled') === 'on';
    run(
      () => saveHttpTool(tool?.id ?? null, input),
      () => !tool && setFormKey((value) => value + 1),
    );
  }

  return (
    <form key={formKey} onSubmit={onSubmit} className="space-y-4 p-4" noValidate>
      {outcome?.ok && <FormMessage tone="success">{t('saved')}</FormMessage>}
      {outcome && !outcome.ok && <FormMessage tone="error">{tErrors(outcome.error)}</FormMessage>}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="name"
          label={t('http.name')}
          hint={t('http.nameHint')}
          defaultValue={tool?.name ?? ''}
          dir="ltr"
          required
          error={error('name')}
        />
        <div>
          <label htmlFor={`${id}-method`} className="mb-1 block font-semibold">
            {t('http.method')}
          </label>
          <select
            id={`${id}-method`}
            name="method"
            defaultValue={tool?.method ?? 'GET'}
            className="field-input"
          >
            {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((method) => (
              <option key={method}>{method}</option>
            ))}
          </select>
        </div>
      </div>
      <TextField
        name="description"
        label={t('http.description')}
        hint={t('http.descriptionHint')}
        defaultValue={tool?.description ?? ''}
        dir="auto"
        required
        error={error('description')}
      />
      <TextField
        name="urlTemplate"
        label={t('http.url')}
        hint={t('http.urlHint')}
        defaultValue={tool?.urlTemplate ?? ''}
        placeholder="https://api.example.com/orders/{orderId}"
        dir="ltr"
        required
        error={error('urlTemplate')}
      />
      <div>
        <label htmlFor={`${id}-schema`} className="mb-1 block font-semibold">
          {t('http.schema')}
        </label>
        <p id={`${id}-schema-hint`} className="mb-1 text-sm text-muted">
          {t('http.schemaHint')}
        </p>
        <textarea
          id={`${id}-schema`}
          name="inputSchema"
          rows={8}
          defaultValue={tool?.inputSchema ?? EXAMPLE_SCHEMA}
          aria-describedby={`${id}-schema-hint`}
          aria-invalid={Boolean(error('inputSchema'))}
          dir="ltr"
          spellCheck={false}
          className="field-input py-2 font-mono text-sm"
        />
        {error('inputSchema') && (
          <p className="mt-1 text-sm font-semibold text-danger">{error('inputSchema')}</p>
        )}
      </div>
      <div>
        <label htmlFor={`${id}-headers`} className="mb-1 block font-semibold">
          {t('http.headers')}
        </label>
        <p id={`${id}-headers-hint`} className="mb-1 text-sm text-muted">
          {tool?.hasHeaders ? t('http.headersKeep') : t('http.headersHint')}
        </p>
        <textarea
          id={`${id}-headers`}
          name="headers"
          rows={3}
          placeholder="Authorization: Bearer …"
          aria-describedby={`${id}-headers-hint`}
          aria-invalid={Boolean(error('headers'))}
          dir="ltr"
          spellCheck={false}
          autoComplete="off"
          className="field-input py-2 font-mono text-sm"
        />
        {error('headers') && (
          <p className="mt-1 text-sm font-semibold text-danger">{error('headers')}</p>
        )}
      </div>
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={tool?.enabled ?? true}
          className="size-5"
        />
        {t('enabled')}
      </label>
      <div className="flex flex-wrap gap-2">
        <SubmitButton pending={pending} pendingLabel={t('saving')}>
          {t('save')}
        </SubmitButton>
        {tool && (
          <DeleteButton pending={pending} onConfirm={() => run(() => deleteHttpTool(tool.id))} />
        )}
      </div>
    </form>
  );
}

interface McpView {
  id: string;
  name: string;
  slug: string;
  url: string;
  hasAuth: boolean;
  enabled: boolean;
  tools: string[];
}

export function McpServerForm({ server }: { server: McpView | null }) {
  const t = useTranslations('AdminTools');
  const tErrors = useTranslations('AdminAgents.errors');
  const tValidation = useTranslations('Validation');
  const { pending, outcome, run, fieldErrors } = useAction();
  const refresh = useAction();
  const [formKey, setFormKey] = useState(0);
  const error = (name: string) =>
    fieldErrors[name]
      ? tValidation.has(fieldErrors[name])
        ? tValidation(fieldErrors[name])
        : fieldErrors[name]
      : undefined;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input: Record<string, string | boolean> = {};
    for (const [key, value] of form.entries()) input[key] = String(value);
    input.enabled = form.get('enabled') === 'on';
    run(
      () => saveMcpServer(server?.id ?? null, input),
      () => !server && setFormKey((value) => value + 1),
    );
  }

  return (
    <div className="space-y-4 p-4">
      <form key={formKey} onSubmit={onSubmit} className="space-y-4" noValidate>
        {outcome?.ok && <FormMessage tone="success">{t('saved')}</FormMessage>}
        {outcome && !outcome.ok && <FormMessage tone="error">{tErrors(outcome.error)}</FormMessage>}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="name"
            label={t('mcp.name')}
            defaultValue={server?.name ?? ''}
            dir="auto"
            required
            error={error('name')}
          />
          <TextField
            name="slug"
            label={t('mcp.slug')}
            hint={t('mcp.slugHint')}
            defaultValue={server?.slug ?? ''}
            dir="ltr"
            required
            error={error('slug')}
          />
        </div>
        <TextField
          name="url"
          type="url"
          label={t('mcp.url')}
          hint={t('mcp.urlHint')}
          defaultValue={server?.url ?? ''}
          dir="ltr"
          required
          error={error('url')}
        />
        <TextField
          name="auth"
          type="password"
          label={t('mcp.auth')}
          hint={server?.hasAuth ? t('mcp.authKeep') : t('mcp.authHint')}
          autoComplete="off"
          dir="ltr"
          error={error('auth')}
        />
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={server?.enabled ?? true}
            className="size-5"
          />
          {t('enabled')}
        </label>
        <div className="flex flex-wrap gap-2">
          <SubmitButton pending={pending} pendingLabel={t('saving')}>
            {t('save')}
          </SubmitButton>
          {server && (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={refresh.pending}
                onClick={() => refresh.run(() => refreshMcpTools(server.id))}
              >
                {refresh.pending ? t('mcp.refreshing') : t('mcp.refresh')}
              </button>
              <DeleteButton
                pending={pending}
                onConfirm={() => run(() => deleteMcpServer(server.id))}
              />
            </>
          )}
        </div>
      </form>
      {refresh.outcome?.ok && (
        <FormMessage tone="success">{t('mcp.refreshed', refresh.outcome.values ?? {})}</FormMessage>
      )}
      {refresh.outcome && !refresh.outcome.ok && (
        <FormMessage tone="error">{tErrors(refresh.outcome.error)}</FormMessage>
      )}
      {server && server.tools.length > 0 && (
        <ul className="flex flex-wrap gap-2 text-sm" aria-label={t('mcp.toolsLabel')}>
          {server.tools.map((name) => (
            <li key={name}>
              <code dir="ltr" className="rounded bg-surface px-2 py-1">
                {name}
              </code>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
