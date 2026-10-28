'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { type FormEvent, useRef, useState } from 'react';
import { FormMessage, SubmitButton } from '@/components/forms';

interface Attempt {
  modelName: string;
  providerName: string;
  ok: boolean;
  errorKind?: string;
}

interface Summary {
  model: { displayName: string; providerName: string };
  usage: { inputTokens: number; outputTokens: number };
  costMicros: string;
  priceMicros: string;
  latencyMs: number;
  attempts: Attempt[];
}

const micros = (value: string) => (Number(value) / 1_000_000).toFixed(6);

/** Parses a text/event-stream body into (event, data) pairs. */
async function* readEvents(response: Response): AsyncGenerator<{ event: string; data: string }> {
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += value;
    let boundary: number;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const event = /^event: (.*)$/m.exec(block)?.[1] ?? 'message';
      const data = /^data: (.*)$/m.exec(block)?.[1] ?? '';
      yield { event, data };
    }
  }
}

export function Playground({ targets }: { targets: { value: string; label: string }[] }) {
  const t = useTranslations('AdminAi.playground');
  const tErrors = useTranslations('AdminAi.errors');
  const format = useFormatter();
  const [output, setOutput] = useState('');
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [failure, setFailure] = useState<{ kind: string; attempts: Attempt[] } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const [kind, id] = String(form.get('target') ?? '').split(':');
    if (!id) return;
    setOutput('');
    setSummary(null);
    setFailure(null);
    setRunning(true);
    setAnnouncement(t('running'));
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch('/api/admin/playground', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          target: kind === 'policy' ? { policyId: id } : { modelId: id },
          system: String(form.get('system') ?? ''),
          prompt: String(form.get('prompt') ?? ''),
        }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setFailure({ kind: body.error ?? 'unknown', attempts: [] });
        setAnnouncement(t('failed'));
        return;
      }
      for await (const { event: name, data } of readEvents(response)) {
        if (name === 'delta') setOutput((previous) => previous + (JSON.parse(data) as string));
        else if (name === 'done') {
          setSummary(JSON.parse(data) as Summary);
          setAnnouncement(t('finished'));
        } else if (name === 'error') {
          setFailure(JSON.parse(data) as { kind: string; attempts: Attempt[] });
          setAnnouncement(t('failed'));
        }
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') setFailure({ kind: 'network', attempts: [] });
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  const attempts = summary?.attempts ?? failure?.attempts ?? [];
  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="playground-target" className="mb-1 block font-semibold">
            {t('target')}
          </label>
          <select id="playground-target" name="target" className="field-input" required>
            {targets.map((target) => (
              <option key={target.value} value={target.value}>
                {target.label}
              </option>
            ))}
          </select>
          {targets.length === 0 && <p className="mt-1 text-sm text-danger">{t('noTargets')}</p>}
        </div>
        <div>
          <label htmlFor="playground-system" className="mb-1 block font-semibold">
            {t('system')}
          </label>
          <textarea
            id="playground-system"
            name="system"
            rows={2}
            maxLength={4000}
            dir="auto"
            className="field-input py-2"
          />
        </div>
        <div>
          <label htmlFor="playground-prompt" className="mb-1 block font-semibold">
            {t('prompt')}
          </label>
          <textarea
            id="playground-prompt"
            name="prompt"
            rows={4}
            maxLength={8000}
            required
            dir="auto"
            className="field-input py-2"
            defaultValue={t('samplePrompt')}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <SubmitButton pending={running} pendingLabel={t('running')}>
            {t('run')}
          </SubmitButton>
          {running && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => abortRef.current?.abort()}
            >
              {t('stop')}
            </button>
          )}
        </div>
      </form>

      <p role="status" className="sr-only">
        {announcement}
      </p>
      <section aria-labelledby="playground-output" aria-busy={running}>
        <h2 id="playground-output" className="text-xl font-bold">
          {t('output')}
        </h2>
        <div
          dir="auto"
          className="mt-2 min-h-24 whitespace-pre-wrap rounded-lg border border-border bg-surface p-4"
        >
          {output || <span className="text-muted">{t('empty')}</span>}
        </div>
      </section>

      {failure && (
        <FormMessage tone="error">
          {tErrors(
            failure.kind.startsWith('no_') || failure.kind === 'disabled'
              ? `unavailable_${failure.kind}`
              : `ai_${failure.kind}`,
          )}
        </FormMessage>
      )}

      {summary && (
        <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[auto_1fr]">
          <dt className="font-semibold">{t('model')}</dt>
          <dd dir="auto">
            {summary.model.providerName} · {summary.model.displayName}
          </dd>
          <dt className="font-semibold">{t('tokens')}</dt>
          <dd>
            {t('tokensValue', {
              input: summary.usage.inputTokens,
              output: summary.usage.outputTokens,
            })}
          </dd>
          <dt className="font-semibold">{t('cost')}</dt>
          <dd dir="ltr" className="text-start">
            {micros(summary.costMicros)} USD
          </dd>
          <dt className="font-semibold">{t('latency')}</dt>
          <dd>{format.number(summary.latencyMs / 1000, { maximumFractionDigits: 2 })} s</dd>
        </dl>
      )}

      {attempts.length > 1 && (
        <section aria-labelledby="attempts-title">
          <h2 id="attempts-title" className="text-lg font-bold">
            {t('attempts')}
          </h2>
          <ol className="mt-2 list-decimal space-y-1 ps-6">
            {attempts.map((attempt, index) => (
              <li key={index}>
                <span dir="auto">
                  {attempt.providerName} · {attempt.modelName}
                </span>
                : {attempt.ok ? t('attemptOk') : tErrors(`ai_${attempt.errorKind ?? 'unknown'}`)}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
