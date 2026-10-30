'use client';

import type { AgentInputField } from '@rentagent/shared';
import { type Challenge, solveChallenge } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/web/pbkdf2';
import { useTranslations } from 'next-intl';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Markdown } from '@/components/markdown';
import { TaskFields } from '@/components/task-fields';

interface Turn {
  id: string;
  status: string;
  message: string | null;
  input: Record<string, unknown> | null;
  output: string | null;
  error: string | null;
}

interface Stored {
  token: string;
  conversationId: string | null;
}

type Phase = 'verifying' | 'ready' | 'failed';
const ACTIVE = new Set(['QUEUED', 'RUNNING', 'WAITING_APPROVAL']);

/** Session and conversation survive reloads within the tab (partitioned storage in iframes). */
function storageKey(widgetKey: string) {
  return `ra_widget_${widgetKey.slice(-24)}`;
}
function load(widgetKey: string): Stored | null {
  try {
    const raw = sessionStorage.getItem(storageKey(widgetKey));
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}
function save(widgetKey: string, value: Stored | null) {
  try {
    if (value) sessionStorage.setItem(storageKey(widgetKey), JSON.stringify(value));
    else sessionStorage.removeItem(storageKey(widgetKey));
  } catch {
    // Storage may be blocked; the chat still works until the page is closed.
  }
}

function closeWidget() {
  // The host page script listens for this message and moves focus back to its button.
  window.parent?.postMessage({ type: 'rentagent:close' }, '*');
}

export function WidgetApp({
  widgetKey,
  locale,
  agent,
}: {
  widgetKey: string;
  locale: string;
  agent: { name: string; description: string; inputFields: AgentInputField[]; followUps: boolean };
}) {
  const t = useTranslations('Widget');
  const tChat = useTranslations('Chat');
  const [phase, setPhase] = useState<Phase>('verifying');
  const [session, setSession] = useState<Stored | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [partial, setPartial] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const streams = useRef(new Set<string>());

  const call = useCallback(async (path: string, token: string, body?: unknown) => {
    const response = await fetch(`/api/widget${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'x-widget-session': token,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: response.status, data };
  }, []);

  /** Proof-of-work verification (ALTCHA), solved in the background, then a visitor session. */
  const verify = useCallback(async () => {
    setPhase('verifying');
    try {
      const post = (path: string, body: unknown) =>
        fetch(`/api/widget/${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
      const challengeResponse = await post('challenge', { key: widgetKey });
      if (!challengeResponse.ok) throw new Error('challenge');
      const challenge = (await challengeResponse.json()) as Challenge;
      const solution = await solveChallenge({ challenge, deriveKey, timeout: 60_000 });
      if (!solution) throw new Error('unsolved');
      const sessionResponse = await post('session', { key: widgetKey, challenge, solution });
      if (!sessionResponse.ok) throw new Error('session');
      const { token } = (await sessionResponse.json()) as { token: string };
      const next = { token, conversationId: null };
      save(widgetKey, next);
      setSession(next);
      setTurns([]);
      setPhase('ready');
    } catch {
      setPhase('failed');
    }
  }, [widgetKey]);

  /** Live updates of a turn over SSE (fetch, so the session header can be sent). */
  const follow = useCallback(
    async (runId: string, token: string) => {
      if (streams.current.has(runId)) return;
      streams.current.add(runId);
      try {
        const response = await fetch(`/api/widget/runs/${runId}/events`, {
          headers: { 'x-widget-session': token },
        });
        if (!response.ok || !response.body) throw new Error('stream');
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          let end;
          while ((end = buffer.indexOf('\n\n')) >= 0) {
            const block = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            const data = block
              .split('\n')
              .filter((line) => line.startsWith('data: '))
              .map((line) => line.slice(6))
              .join('\n');
            if (!data) continue;
            if (block.startsWith('event: partial')) {
              const { text } = JSON.parse(data) as { text: string };
              setPartial((current) => ({ ...current, [runId]: text }));
            } else {
              const run = JSON.parse(data) as Turn;
              setTurns((current) => current.map((turn) => (turn.id === run.id ? run : turn)));
            }
          }
        }
      } catch {
        setError(tChat('connectionLost'));
      } finally {
        streams.current.delete(runId);
      }
    },
    [tChat],
  );

  // Restores once per page load; re-running could overwrite live updates with an older fetch.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const stored = load(widgetKey);
    if (!stored) {
      // Syncing from browser storage and the server (external systems) on mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void verify();
      return;
    }
    // Restore the session and, if any, the conversation of this tab.
    void (async () => {
      setSession(stored);
      if (stored.conversationId) {
        const { status, data } = await call(
          `/conversations/${stored.conversationId}`,
          stored.token,
        );
        if (status === 401) return verify();
        if (status === 200) {
          const restored = (data.turns as Turn[]) ?? [];
          setTurns(restored);
          for (const turn of restored)
            if (ACTIVE.has(turn.status)) void follow(turn.id, stored.token);
        }
      }
      setPhase('ready');
    })();
  }, [widgetKey, verify, call, follow]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeWidget();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleError = (status: number, data: Record<string, unknown>) => {
    const err = (data.error ?? {}) as { code?: string; fields?: Record<string, string> };
    if (status === 401) {
      save(widgetKey, null);
      void verify();
      return;
    }
    setFieldErrors(err.fields ?? {});
    const code = (err.code ?? 'generic').replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
    setError(tChat.has(`errors.${code}`) ? tChat(`errors.${code}`) : t('error'));
  };

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || pending) return;
    const form = new FormData(event.currentTarget);
    const input = Object.fromEntries(
      agent.inputFields.map((f) => [f.key, String(form.get(f.key) ?? '')]),
    );
    setPending(true);
    setError(null);
    const { status, data } = await call('/conversations', session.token, { input, locale });
    setPending(false);
    if (status !== 201) return handleError(status, data);
    const next = { ...session, conversationId: data.id as string };
    save(widgetKey, next);
    setSession(next);
    setFieldErrors({});
    const started = data.turns as Turn[];
    setTurns(started);
    void follow(started[0]!.id, session.token);
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session?.conversationId || pending || !message.trim()) return;
    setPending(true);
    setError(null);
    const { status, data } = await call(
      `/conversations/${session.conversationId}/messages`,
      session.token,
      {
        message,
        locale,
      },
    );
    setPending(false);
    if (status !== 201) return handleError(status, data);
    setMessage('');
    setTurns((current) => [...current, data as unknown as Turn]);
    void follow(data.id as string, session.token);
  }

  function newChat() {
    if (!session) return;
    const next = { ...session, conversationId: null };
    save(widgetKey, next);
    setSession(next);
    setTurns([]);
    setPartial({});
    setError(null);
  }

  const busy = turns.some((turn) => ACTIVE.has(turn.status));
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-border bg-surface px-4 py-3">
        <h1 className="text-lg font-bold" dir="auto">
          {agent.name}
        </h1>
        <button type="button" className="btn btn-secondary" onClick={closeWidget}>
          {t('close')}
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {phase === 'verifying' && (
          <p role="status" aria-live="polite">
            {t('verifying')}
          </p>
        )}
        {phase === 'failed' && (
          <div role="alert" className="space-y-3">
            <p>{t('verifyFailed')}</p>
            <button type="button" className="btn btn-primary" onClick={() => void verify()}>
              {t('retry')}
            </button>
          </div>
        )}

        {phase === 'ready' && turns.length === 0 && (
          <form onSubmit={start} className="space-y-4" noValidate>
            <p dir="auto">{agent.description}</p>
            <TaskFields fields={agent.inputFields} errors={fieldErrors} />
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? tChat('waitForAnswer') : t('start')}
            </button>
          </form>
        )}

        {turns.length > 0 && (
          <ol className="space-y-4" aria-label={tChat('messages')}>
            {turns.map((turn) => (
              <li key={turn.id} className="space-y-2">
                <div className="rounded-lg bg-surface p-3">
                  <p className="text-sm font-semibold">{tChat('you')}</p>
                  <p dir="auto" className="whitespace-pre-wrap">
                    {turn.message ??
                      Object.values(turn.input ?? {})
                        .filter(Boolean)
                        .join('\n')}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-sm font-semibold" dir="auto">
                    {agent.name}
                  </p>
                  {turn.output ? (
                    <Markdown>{turn.output}</Markdown>
                  ) : partial[turn.id] ? (
                    <Markdown>{partial[turn.id]!}</Markdown>
                  ) : null}
                  {turn.status === 'WAITING_APPROVAL' && <p>{t('waitingOwner')}</p>}
                  {turn.status === 'FAILED' && (
                    <p>
                      {tChat.has(`runErrors.${turn.error}`)
                        ? tChat(`runErrors.${turn.error}`)
                        : tChat('runErrors.generic')}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
        {/* One polite live region announces progress without moving focus. */}
        <p role="status" aria-live="polite" className="sr-only">
          {turns.length
            ? tChat(
                `status.${turns.at(-1)!.status === 'WAITING_APPROVAL' ? 'QUEUED' : turns.at(-1)!.status}`,
              )
            : ''}
        </p>
        {error && (
          <p role="alert" className="font-semibold text-danger">
            {error}
          </p>
        )}
      </div>

      {phase === 'ready' && turns.length > 0 && (
        <div className="space-y-2 border-t border-border p-4">
          {agent.followUps ? (
            <form onSubmit={send} className="space-y-2">
              <label htmlFor="widget-message" className="block font-semibold">
                {tChat('messageLabel')}
              </label>
              <textarea
                id="widget-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={2}
                maxLength={8000}
                dir="auto"
                className="field-input"
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey))
                    event.currentTarget.form?.requestSubmit();
                }}
              />
              <div className="flex flex-wrap gap-2">
                <button type="submit" className="btn btn-primary" disabled={busy || pending}>
                  {busy ? tChat('waitForAnswer') : tChat('send')}
                </button>
                <button type="button" className="btn btn-secondary" onClick={newChat}>
                  {t('newChat')}
                </button>
              </div>
            </form>
          ) : (
            <button type="button" className="btn btn-secondary" onClick={newChat} disabled={busy}>
              {t('newChat')}
            </button>
          )}
        </div>
      )}
      <p className="border-t border-border px-4 py-2 text-xs text-muted">{t('disclaimer')}</p>
    </div>
  );
}
