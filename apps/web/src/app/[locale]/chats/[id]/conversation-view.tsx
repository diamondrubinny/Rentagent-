'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { FormMessage } from '@/components/forms';
import { Markdown } from '@/components/markdown';
import { useAction } from '@/components/use-action';
import { useRouter } from '@/i18n/navigation';
import {
  cancelMyRun,
  decideMyApproval,
  rateRun,
  renameConversation,
  sendMessage,
} from '../actions';
import { DeleteConversationButton } from '../delete-button';

export interface Turn {
  id: string;
  /** Follow-up text; null for the first turn, which shows the task form fields. */
  userText: string | null;
  userFields: { label: string; value: string }[];
  status: string;
  output: string | null;
  errorKind: string | null;
  rating: number | null;
  feedback: string | null;
  approvals: { id: string; toolName: string; input: unknown; status: string }[];
  tools: { toolName: string; ok: boolean }[];
}

interface Labels {
  tools: Record<string, string>;
  mcp: Record<string, string>;
}

interface LiveSnapshot {
  status: string;
  errorKind: string | null;
  output: string | null;
  steps: { toolName: string | null; ok: boolean }[];
  approvals: Turn['approvals'];
}

const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'CANCELED']);
const MESSAGE_MAX = 8000;

function toolLabel(labels: Labels, name: string): string {
  if (labels.tools[name]) return labels.tools[name];
  const separator = name.indexOf('__');
  if (separator > 0) {
    const server = labels.mcp[name.slice(0, separator)];
    if (server) return `${server}: ${name.slice(separator + 2)}`;
  }
  return name;
}

function download(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const safeFilename = (title: string) =>
  title
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .trim()
    .slice(0, 80) || 'answer';

/** Live state of the newest turn while it runs (SSE); the page refreshes when it ends. */
function useLiveTurn(turn: Turn | undefined) {
  const router = useRouter();
  // State is tagged with its run id, so a new turn starts from a clean slate.
  const [state, setState] = useState<{
    runId: string;
    live: LiveSnapshot | null;
    partial: string;
    connectionLost: boolean;
  } | null>(null);
  const active = Boolean(turn && !TERMINAL.has(turn.status));
  const runId = turn?.id;

  useEffect(() => {
    if (!active || !runId) return;
    const update = (patch: Partial<NonNullable<typeof state>>) =>
      setState((previous) => ({
        ...(previous?.runId === runId
          ? previous
          : { runId, live: null, partial: '', connectionLost: false }),
        ...patch,
      }));
    const source = new EventSource(`/api/runs/${runId}/events`);
    let toolSteps = -1;
    source.onmessage = (event) => {
      const next = JSON.parse(event.data) as LiveSnapshot;
      // A finished tool step means the next model step starts a new text.
      const newStep = next.steps.length !== toolSteps;
      toolSteps = next.steps.length;
      update({ live: next, connectionLost: false, ...(newStep ? { partial: '' } : {}) });
      if (TERMINAL.has(next.status)) {
        source.close();
        router.refresh();
      }
    };
    source.addEventListener('partial', (event) =>
      update({
        partial: (JSON.parse((event as MessageEvent<string>).data) as { text: string }).text,
      }),
    );
    source.onerror = () => update({ connectionLost: source.readyState !== EventSource.OPEN });
    return () => source.close();
  }, [active, runId, router]);

  const current = active && state?.runId === runId ? state : null;
  return {
    live: current?.live ?? null,
    partial: current?.partial ?? '',
    connectionLost: current?.connectionLost ?? false,
  };
}

export function ConversationView({
  conversation,
  agentName,
  locale,
  turns,
  followUp,
  labels,
}: {
  conversation: { id: string; title: string };
  agentName: string;
  locale: string;
  turns: Turn[];
  followUp: 'allowed' | 'disabled' | 'agentUnavailable';
  labels: Labels;
}) {
  const t = useTranslations('Chat');
  const tStatus = useTranslations('Chat.status');
  const last = turns.at(-1);
  const { live, partial, connectionLost } = useLiveTurn(last);
  const busy = Boolean(last && !TERMINAL.has(live?.status ?? last.status));

  // Announce state changes, not every streamed token.
  const status = live?.status ?? last?.status ?? '';
  const [announcement, setAnnouncement] = useState('');
  const announced = useRef(status);
  useEffect(() => {
    if (announced.current !== status) {
      announced.current = status;
      setAnnouncement(tStatus(status));
    }
  }, [status, tStatus]);

  return (
    <div className="space-y-6">
      <ConversationHeader conversation={conversation} agentName={agentName} turns={turns} />
      <p role="status" className="sr-only">
        {announcement}
      </p>
      {connectionLost && busy && (
        <p className="no-print rounded-lg border border-danger p-3 text-danger">
          {t('connectionLost')}
        </p>
      )}

      <ol className="space-y-6" aria-label={t('messages')}>
        {turns.map((turn, index) => {
          const isLast = index === turns.length - 1;
          const merged: Turn =
            isLast && live
              ? {
                  ...turn,
                  status: live.status,
                  errorKind: live.errorKind,
                  output: live.output,
                  approvals: live.approvals.filter((approval) => approval.status === 'PENDING'),
                  tools: live.steps.map((step) => ({ toolName: step.toolName ?? '', ok: step.ok })),
                }
              : turn;
          return (
            <TurnView
              key={turn.id}
              turn={merged}
              partial={isLast ? partial : ''}
              agentName={agentName}
              title={conversation.title}
              labels={labels}
            />
          );
        })}
      </ol>

      <Composer conversationId={conversation.id} locale={locale} busy={busy} followUp={followUp} />
    </div>
  );
}

function ConversationHeader({
  conversation,
  agentName,
  turns,
}: {
  conversation: { id: string; title: string };
  agentName: string;
  turns: Turn[];
}) {
  const t = useTranslations('Chat');
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const { pending, outcome, run, fieldErrors } = useAction();
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const transcript = () =>
    turns
      .map((turn) => {
        const asked =
          turn.userText ?? turn.userFields.map((f) => `**${f.label}**: ${f.value}`).join('\n\n');
        return `### ${t('you')}\n\n${asked}\n\n### ${agentName}\n\n${turn.output ?? ''}`;
      })
      .join('\n\n---\n\n');

  function onRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = String(new FormData(event.currentTarget).get('title') ?? '');
    run(
      () => renameConversation(conversation.id, title),
      () => {
        setEditing(false);
        router.refresh();
      },
    );
  }

  return (
    <div className="space-y-3">
      {editing ? (
        <form onSubmit={onRename} className="no-print flex flex-wrap items-end gap-2">
          <div className="min-w-60 flex-1">
            <label htmlFor="conversation-title" className="mb-1 block font-semibold">
              {t('titleLabel')}
            </label>
            <input
              ref={inputRef}
              id="conversation-title"
              name="title"
              defaultValue={conversation.title}
              maxLength={200}
              required
              dir="auto"
              className="field-input"
              aria-invalid={Boolean(fieldErrors.title)}
              aria-describedby={fieldErrors.title ? 'conversation-title-error' : undefined}
            />
            {fieldErrors.title && (
              <p id="conversation-title-error" className="mt-1 text-sm font-semibold text-danger">
                {t(`validation.${fieldErrors.title}`)}
              </p>
            )}
          </div>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {t('save')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>
            {t('cancel')}
          </button>
        </form>
      ) : (
        <h1 id="conversation-heading" className="text-3xl font-bold" dir="auto">
          {conversation.title}
        </h1>
      )}
      {outcome && !outcome.ok && !outcome.fieldErrors && (
        <FormMessage tone="error">{t(`errors.${outcome.error}`)}</FormMessage>
      )}
      <div className="no-print flex flex-wrap gap-2">
        {!editing && (
          <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
            {t('rename')}
          </button>
        )}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() =>
            download(`${safeFilename(conversation.title)}.md`, transcript(), 'text/markdown')
          }
        >
          {t('downloadChat')}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
          {t('print')}
        </button>
        <DeleteConversationButton
          id={conversation.id}
          title={conversation.title}
          describedBy="conversation-heading"
          redirectTo="/chats"
        />
      </div>
    </div>
  );
}

function TurnView({
  turn,
  partial,
  agentName,
  title,
  labels,
}: {
  turn: Turn;
  partial: string;
  agentName: string;
  title: string;
  labels: Labels;
}) {
  const t = useTranslations('Chat');
  const tStatus = useTranslations('Chat.status');
  const tRunErrors = useTranslations('Chat.runErrors');
  const action = useAction();
  const running = !TERMINAL.has(turn.status);
  const usedTools = [...new Set(turn.tools.map((tool) => toolLabel(labels, tool.toolName)))];

  return (
    <li className="space-y-3">
      <article
        className="chat-message ms-auto max-w-[85%] rounded-lg bg-surface p-4"
        aria-labelledby={`you-${turn.id}`}
      >
        <h2 id={`you-${turn.id}`} className="mb-1 text-sm font-bold text-muted">
          {t('you')}
        </h2>
        {turn.userText !== null ? (
          <p className="whitespace-pre-wrap" dir="auto">
            {turn.userText}
          </p>
        ) : (
          <dl className="space-y-2">
            {turn.userFields.map((field) => (
              <div key={field.label}>
                <dt className="font-semibold" dir="auto">
                  {field.label}
                </dt>
                <dd className="whitespace-pre-wrap" dir="auto">
                  {field.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </article>

      <article
        className="chat-message max-w-[95%] rounded-lg border border-border p-4"
        aria-labelledby={`agent-${turn.id}`}
        aria-busy={running}
      >
        <h2 id={`agent-${turn.id}`} className="mb-1 text-sm font-bold text-muted" dir="auto">
          {agentName}
        </h2>
        {usedTools.length > 0 && (
          <p className="mb-2 text-sm text-muted" dir="auto">
            {t('usedTools', { tools: usedTools.join(', ') })}
          </p>
        )}

        {turn.approvals.map((approval) => (
          <section
            key={approval.id}
            aria-labelledby={`approval-${approval.id}`}
            className="no-print my-3 space-y-3 rounded-lg border-2 border-danger bg-warning-bg p-4"
          >
            <h3 id={`approval-${approval.id}`} className="font-bold" dir="auto">
              {t('approvalTitle', { action: toolLabel(labels, approval.toolName) })}
            </h3>
            <p>{t('approvalIntro')}</p>
            <ApprovalInput input={approval.input} />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-primary"
                disabled={action.pending}
                onClick={() => action.run(() => decideMyApproval(approval.id, true))}
              >
                {t('approve')}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={action.pending}
                onClick={() => action.run(() => decideMyApproval(approval.id, false))}
              >
                {t('reject')}
              </button>
            </div>
          </section>
        ))}
        {action.outcome && !action.outcome.ok && (
          <FormMessage tone="error">{t(`errors.${action.outcome.error}`)}</FormMessage>
        )}

        {turn.status === 'SUCCEEDED' && turn.output !== null ? (
          <>
            <Markdown>{turn.output}</Markdown>
            <AnswerActions turn={turn} title={title} />
          </>
        ) : running ? (
          <>
            {partial ? (
              <Markdown>{partial}</Markdown>
            ) : (
              <p className="text-muted">{tStatus(turn.status)}</p>
            )}
            {turn.approvals.length === 0 && (
              <button
                type="button"
                className="no-print btn btn-secondary mt-3"
                disabled={action.pending}
                onClick={() => action.run(() => cancelMyRun(turn.id))}
              >
                {t('stop')}
              </button>
            )}
          </>
        ) : turn.status === 'CANCELED' ? (
          <p className="text-muted">{tStatus('CANCELED')}</p>
        ) : (
          <>
            <p className="font-semibold text-danger">
              {turn.errorKind && tRunErrors.has(turn.errorKind)
                ? tRunErrors(turn.errorKind)
                : tRunErrors('generic')}
            </p>
            <AnswerActions turn={turn} title={title} />
          </>
        )}
      </article>
    </li>
  );
}

function ApprovalInput({ input }: { input: unknown }) {
  if (input === null || typeof input !== 'object' || Array.isArray(input))
    return (
      <pre dir="ltr" className="overflow-x-auto whitespace-pre-wrap rounded bg-bg p-3 text-sm">
        {JSON.stringify(input, null, 2)}
      </pre>
    );
  return (
    <dl className="space-y-2 rounded bg-bg p-3">
      {Object.entries(input).map(([key, value]) => (
        <div key={key}>
          <dt className="text-sm font-semibold">
            <code dir="ltr">{key}</code>
          </dt>
          <dd className="whitespace-pre-wrap break-words" dir="auto">
            {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function AnswerActions({ turn, title }: { turn: Turn; title: string }) {
  const t = useTranslations('Chat');
  const router = useRouter();
  const { pending, outcome, run } = useAction();
  const [copied, setCopied] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const feedbackRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (showFeedback) feedbackRef.current?.focus();
  }, [showFeedback]);

  const rate = (rating: 1 | -1 | 0, feedback = '') =>
    run(
      () => rateRun(turn.id, { rating, feedback }),
      () => {
        setShowFeedback(rating === -1 && !feedback);
        router.refresh();
      },
    );

  async function copy() {
    try {
      await navigator.clipboard.writeText(turn.output ?? '');
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="no-print mt-4 space-y-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-2">
        {turn.output && (
          <>
            <button type="button" className="btn btn-secondary" onClick={copy}>
              {t('copy')}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() =>
                download(`${safeFilename(title)}.md`, turn.output ?? '', 'text/markdown')
              }
            >
              {t('downloadMd')}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() =>
                download(`${safeFilename(title)}.txt`, turn.output ?? '', 'text/plain')
              }
            >
              {t('downloadTxt')}
            </button>
          </>
        )}
        <span className="ms-auto flex gap-2" role="group" aria-label={t('rateLabel')}>
          <button
            type="button"
            className="btn btn-secondary"
            aria-pressed={turn.rating === 1}
            disabled={pending}
            onClick={() => rate(turn.rating === 1 ? 0 : 1)}
          >
            <span aria-hidden="true">👍 </span>
            {t('helpful')}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            aria-pressed={turn.rating === -1}
            disabled={pending}
            onClick={() => rate(turn.rating === -1 ? 0 : -1)}
          >
            <span aria-hidden="true">👎 </span>
            {t('notHelpful')}
          </button>
        </span>
      </div>
      <p role="status" className="text-sm">
        {copied ? t('copied') : ''}
      </p>
      {outcome && !outcome.ok && (
        <FormMessage tone="error">{t(`errors.${outcome.error}`)}</FormMessage>
      )}
      {showFeedback && (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            rate(-1, String(new FormData(event.currentTarget).get('feedback') ?? ''));
          }}
        >
          <label htmlFor={`feedback-${turn.id}`} className="block font-semibold">
            {t('feedbackLabel')}
          </label>
          <textarea
            ref={feedbackRef}
            id={`feedback-${turn.id}`}
            name="feedback"
            rows={3}
            maxLength={1000}
            dir="auto"
            className="field-input py-2"
          />
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {t('sendFeedback')}
          </button>
        </form>
      )}
      {turn.feedback && <p className="text-sm text-muted">{t('feedbackThanks')}</p>}
    </div>
  );
}

function Composer({
  conversationId,
  locale,
  busy,
  followUp,
}: {
  conversationId: string;
  locale: string;
  busy: boolean;
  followUp: 'allowed' | 'disabled' | 'agentUnavailable';
}) {
  const t = useTranslations('Chat');
  const router = useRouter();
  const { pending, outcome, run, fieldErrors } = useAction();
  const [text, setText] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  if (followUp !== 'allowed')
    return (
      <p className="no-print rounded-lg border border-border p-4">
        {followUp === 'disabled' ? t('followUpsDisabled') : t('agentUnavailable')}
      </p>
    );

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || pending) return;
    run(
      () => sendMessage(conversationId, text, locale),
      () => {
        setText('');
        router.refresh();
      },
    );
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  const error = fieldErrors.message ? t(`validation.${fieldErrors.message}`) : undefined;
  return (
    <form ref={formRef} onSubmit={onSubmit} className="no-print space-y-2" noValidate>
      {outcome && !outcome.ok && !outcome.fieldErrors && (
        <FormMessage tone="error">{t(`errors.${outcome.error}`)}</FormMessage>
      )}
      <label htmlFor="chat-message" className="block font-semibold">
        {t('messageLabel')}
      </label>
      <p id="chat-message-hint" className="text-sm text-muted">
        {t('messageHint')}
      </p>
      <textarea
        id="chat-message"
        name="message"
        rows={4}
        dir="auto"
        value={text}
        maxLength={MESSAGE_MAX}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        className="field-input py-2"
        aria-invalid={Boolean(error)}
        aria-describedby={['chat-message-hint', error ? 'chat-message-error' : '']
          .filter(Boolean)
          .join(' ')}
      />
      {error && (
        <p id="chat-message-error" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="btn btn-primary"
          disabled={busy || pending}
          aria-busy={pending}
        >
          {busy ? t('waitForAnswer') : t('send')}
        </button>
        <span className="text-sm text-muted" aria-live="off">
          {t('characters', { count: text.length, max: MESSAGE_MAX })}
        </span>
      </div>
    </form>
  );
}
