'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { FormMessage } from '@/components/forms';
import { authClient } from '@/lib/auth-client';
import { authErrorKey } from '@/lib/auth-errors';

interface SessionRow {
  id: string;
  token: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: Date;
  expiresAt: Date;
}

/** Short, human-readable device description from a User-Agent string. */
function describeAgent(userAgent: string | null | undefined): string {
  if (!userAgent) return '—';
  const browser =
    /(Edg|Firefox|Chrome|Safari|OPR)\/[\d.]+/.exec(userAgent)?.[0]?.replace('Edg', 'Edge') ?? '';
  const os =
    /(Windows NT [\d.]+|Mac OS X [\d_]+|Android [\d.]+|iPhone OS [\d_]+|Linux)/.exec(
      userAgent,
    )?.[0] ?? '';
  return [browser, os.replace(/_/g, '.')].filter(Boolean).join(' · ') || userAgent.slice(0, 60);
}

export function SessionsList() {
  const t = useTranslations('Account.security.sessions');
  const tErrors = useTranslations('AuthErrors');
  const format = useFormatter();
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [currentId, setCurrentId] = useState<string>();
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState('');

  const load = useCallback(async () => {
    const [list, current] = await Promise.all([authClient.listSessions(), authClient.getSession()]);
    if (list.error) {
      setError(authErrorKey(list.error));
      setSessions([]);
      return;
    }
    setCurrentId(current.data?.session.id);
    setSessions(list.data as SessionRow[]);
  }, []);

  useEffect(() => {
    // Fetching from the auth API on mount is a sync with an external system.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function revoke(token: string) {
    const { error: revokeError } = await authClient.revokeSession({ token });
    if (revokeError) return setError(authErrorKey(revokeError));
    setStatus(t('revoked'));
    await load();
  }

  async function revokeOthers() {
    const { error: revokeError } = await authClient.revokeOtherSessions();
    if (revokeError) return setError(authErrorKey(revokeError));
    setStatus(t('revokedOthers'));
    await load();
  }

  if (sessions === null) return <p className="mt-4 text-muted">{t('loading')}</p>;

  return (
    <div className="mt-4 space-y-4">
      {error && <FormMessage tone="error">{tErrors(error)}</FormMessage>}
      <p role="status" className="sr-only">
        {status}
      </p>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {sessions.map((session) => {
          const isCurrent = session.id === currentId;
          return (
            <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-semibold" dir="ltr">
                  {describeAgent(session.userAgent)}
                </p>
                <p className="text-sm text-muted">
                  {t('details', {
                    ip: session.ipAddress ?? '—',
                    created: format.dateTime(new Date(session.createdAt), {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }),
                  })}
                </p>
                {isCurrent && <p className="text-sm font-semibold text-success">{t('current')}</p>}
              </div>
              {!isCurrent && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void revoke(session.token)}
                  aria-label={t('revokeLabel', { device: describeAgent(session.userAgent) })}
                >
                  {t('revoke')}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {sessions.length > 1 && (
        <button type="button" className="btn btn-secondary" onClick={() => void revokeOthers()}>
          {t('revokeOthers')}
        </button>
      )}
    </div>
  );
}
