'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { FormMessage } from '@/components/forms';
import { Markdown } from '@/components/markdown';
import { useAction } from '@/components/use-action';
import { cancelRun, decideApproval } from '../../agents/actions';

interface Snapshot {
  id: string;
  agentName: string;
  status: string;
  errorKind: string | null;
  output: string | null;
  input: Record<string, unknown>;
  costMicros: string;
  inputTokens: number;
  outputTokens: number;
  steps: {
    idx: number;
    stepType: string;
    toolName: string | null;
    ok: boolean;
    detail: Record<string, unknown>;
  }[];
  approvals: { id: string; toolName: string; input: unknown; status: string }[];
}

const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'CANCELED']);

export function RunView({ runId }: { runId: string }) {
  const t = useTranslations('AdminAgents.run');
  const tStatus = useTranslations('AdminAgents.runStatus');
  const tErrors = useTranslations('AdminAgents.errors');
  const tAiErrors = useTranslations('AdminAi.errors');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [connection, setConnection] = useState<'live' | 'closed' | 'error'>('live');
  const action = useAction();
  const statusRef = useRef<string | null>(null);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    const source = new EventSource(`/api/admin/runs/${runId}/events`);
    source.onmessage = (event) => {
      const next = JSON.parse(event.data) as Snapshot;
      setSnapshot(next);
      if (statusRef.current !== next.status) {
        statusRef.current = next.status;
        setAnnouncement(tStatus(next.status));
      }
      if (TERMINAL.has(next.status)) {
        source.close();
        setConnection('closed');
      }
    };
    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED)
        setConnection(TERMINAL.has(statusRef.current ?? '') ? 'closed' : 'error');
    };
    return () => source.close();
  }, [runId, tStatus]);

  if (!snapshot) return <p aria-busy="true">{t('loading')}</p>;
  const pendingApprovals = snapshot.approvals.filter((approval) => approval.status === 'PENDING');
  const running = !TERMINAL.has(snapshot.status);
  const errorText = (kind: string) =>
    tErrors.has(`run_${kind}`)
      ? tErrors(`run_${kind}`)
      : tAiErrors.has(`ai_${kind}`)
        ? tAiErrors(`ai_${kind}`)
        : tAiErrors.has(kind)
          ? tAiErrors(kind)
          : kind;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">
          {t('title')}: <span dir="auto">{snapshot.agentName}</span>
        </h1>
        <p className="mt-2 text-lg">
          <strong>{tStatus(snapshot.status)}</strong>
          {snapshot.errorKind && ` · ${errorText(snapshot.errorKind)}`}
        </p>
        <p className="text-sm text-muted">
          {t('usage', { input: snapshot.inputTokens, output: snapshot.outputTokens })} ·{' '}
          <span dir="ltr">{(Number(snapshot.costMicros) / 1e6).toFixed(4)} USD</span>
        </p>
        <p role="status" className="sr-only">
          {announcement}
        </p>
        {connection === 'error' && <p className="text-sm text-danger">{t('connectionLost')}</p>}
      </div>

      {action.outcome && !action.outcome.ok && (
        <FormMessage tone="error">{tErrors(action.outcome.error)}</FormMessage>
      )}

      {pendingApprovals.map((approval) => (
        <section
          key={approval.id}
          aria-labelledby={`approval-${approval.id}`}
          className="space-y-3 rounded-lg border-2 border-danger bg-warning-bg p-4"
        >
          <h2 id={`approval-${approval.id}`} className="text-lg font-bold">
            {t('approvalTitle', { tool: approval.toolName })}
          </h2>
          <p>{t('approvalIntro')}</p>
          <pre dir="ltr" className="overflow-x-auto whitespace-pre-wrap rounded bg-bg p-3 text-sm">
            {JSON.stringify(approval.input, null, 2)}
          </pre>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={action.pending}
              onClick={() => action.run(() => decideApproval(approval.id, true))}
            >
              {t('approve')}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={action.pending}
              onClick={() => action.run(() => decideApproval(approval.id, false))}
            >
              {t('reject')}
            </button>
          </div>
        </section>
      ))}

      {running && (
        <button
          type="button"
          className="btn btn-secondary"
          disabled={action.pending}
          onClick={() => action.run(() => cancelRun(runId))}
        >
          {t('cancel')}
        </button>
      )}

      {snapshot.output && (
        <section
          aria-labelledby="run-output"
          className="rounded-lg border border-border bg-surface p-4"
        >
          <h2 id="run-output" className="mb-3 text-xl font-bold">
            {t('output')}
          </h2>
          <Markdown>{snapshot.output}</Markdown>
        </section>
      )}

      <section aria-labelledby="run-input">
        <h2 id="run-input" className="text-xl font-bold">
          {t('input')}
        </h2>
        <dl className="mt-2 space-y-2">
          {Object.entries(snapshot.input).map(([key, value]) => (
            <div key={key}>
              <dt className="font-semibold" dir="ltr">
                {key}
              </dt>
              <dd className="whitespace-pre-wrap" dir="auto">
                {String(value)}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="run-steps" aria-busy={running}>
        <h2 id="run-steps" className="text-xl font-bold">
          {t('steps')}
        </h2>
        {snapshot.steps.length === 0 ? (
          <p className="mt-2 text-muted">{running ? t('waiting') : t('noSteps')}</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {snapshot.steps.map((step) => (
              <li
                key={step.idx}
                className={`rounded-lg border p-3 ${step.ok ? 'border-border' : 'border-danger'}`}
              >
                <p className="font-semibold">
                  {step.idx + 1}. {t(`step_${step.stepType}`)}
                  {step.toolName && (
                    <>
                      {' · '}
                      <code dir="ltr">{step.toolName}</code>
                    </>
                  )}
                  {!step.ok && <span className="ms-2 text-danger">{t('stepFailed')}</span>}
                </p>
                {step.stepType === 'MODEL' ? (
                  <div className="mt-1 text-sm text-muted">
                    <p dir="auto">{String(step.detail.model ?? '')}</p>
                    {Array.isArray(step.detail.toolCalls) && step.detail.toolCalls.length > 0 && (
                      <p>
                        {t('calledTools', {
                          tools: (step.detail.toolCalls as string[]).join(', '),
                        })}
                      </p>
                    )}
                  </div>
                ) : (
                  <pre
                    dir="ltr"
                    className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-surface p-2 text-xs"
                  >
                    {JSON.stringify(step.detail, null, 2)}
                  </pre>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
