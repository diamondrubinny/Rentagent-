'use client';

import { useTranslations } from 'next-intl';
import { useId, useState, useTransition } from 'react';
import { changeUserRole, revokeUserSessions, setUserStatus } from './actions';

interface UserActionsProps {
  userId: string;
  userLabel: string;
  role: string;
  status: string;
  roleOptions: { value: string; label: string }[];
}

export function UserActions({ userId, userLabel, role, status, roleOptions }: UserActionsProps) {
  const t = useTranslations('Admin.users');
  const tErrors = useTranslations('Admin.errors');
  const id = useId();
  const [selectedRole, setSelectedRole] = useState(role);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    startTransition(async () => {
      const result = await action();
      setMessage(result.ok ? success : tErrors(result.error ?? 'generic'));
      setConfirming(false);
    });

  return (
    <div className="flex min-w-56 flex-col gap-2">
      <div className="flex gap-2">
        <label htmlFor={`${id}-role`} className="sr-only">
          {t('roleFor', { name: userLabel })}
        </label>
        <select
          id={`${id}-role`}
          value={selectedRole}
          onChange={(event) => setSelectedRole(event.target.value)}
          className="field-input min-h-10"
          disabled={pending}
        >
          {roleOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-secondary min-h-10"
          disabled={pending || selectedRole === role}
          onClick={() => run(() => changeUserRole(userId, selectedRole), t('roleSaved'))}
        >
          {t('saveRole')}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {status === 'ACTIVE' ? (
          confirming ? (
            <>
              <button
                type="button"
                className="btn min-h-10 bg-danger text-primary-fg"
                disabled={pending}
                onClick={() => run(() => setUserStatus(userId, 'DISABLED'), t('userDisabled'))}
              >
                {t('confirmDisable', { name: userLabel })}
              </button>
              <button
                type="button"
                className="btn btn-secondary min-h-10"
                onClick={() => setConfirming(false)}
              >
                {t('cancel')}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-secondary min-h-10"
              onClick={() => setConfirming(true)}
            >
              {t('disable')}
            </button>
          )
        ) : (
          <button
            type="button"
            className="btn btn-secondary min-h-10"
            disabled={pending}
            onClick={() => run(() => setUserStatus(userId, 'ACTIVE'), t('userEnabled'))}
          >
            {t('enable')}
          </button>
        )}
        <button
          type="button"
          className="btn btn-secondary min-h-10"
          disabled={pending}
          onClick={() => run(() => revokeUserSessions(userId), t('sessionsRevoked'))}
        >
          {t('signOutEverywhere')}
        </button>
      </div>
      <p role="status" className="text-sm">
        {message}
      </p>
    </div>
  );
}
