'use server';

import { rateLimit } from '@rentagent/core';
import { can } from '@rentagent/shared';
import { audit } from '@/lib/server/audit';
import { getAuth } from '@/lib/server/auth';
import { ACTIVE_RUN_STATUSES } from '@/lib/server/runs';
import { db, redis } from '@/lib/server/runtime';
import { getCurrentUser } from '@/lib/server/session';

export type DeleteAccountResult = { ok: true } | { ok: false; error: string };

/**
 * Permanently deletes the signed-in account after re-checking the password.
 * Conversations, sessions and sign-in methods are removed with it; usage
 * records stay without the link to the person (accounting). Staff accounts are
 * removed by an owner so an installation never loses its last administrator.
 */
export async function deleteAccount(password: string): Promise<DeleteAccountResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'signedOut' };
  if (can(user.role, 'admin.access')) return { ok: false, error: 'staffAccount' };
  const limit = await rateLimit(redis(), `delete-account:${user.id}`, 5, 15 * 60);
  if (!limit.allowed) return { ok: false, error: 'rateLimited' };
  if (typeof password !== 'string' || password.length === 0 || password.length > 128)
    return { ok: false, error: 'wrongPassword' };

  const context = await (await getAuth()).$context;
  const account = await context.internalAdapter.findCredentialAccount(user.id);
  if (
    !account?.password ||
    !(await context.password.verify({ hash: account.password, password }))
  ) {
    await audit('account.delete_failed', { actorId: user.id });
    return { ok: false, error: 'wrongPassword' };
  }

  await db().$transaction([
    db().run.updateMany({
      where: { userId: user.id, status: { in: [...ACTIVE_RUN_STATUSES] } },
      data: { cancelRequested: true, status: 'CANCELED', finishedAt: new Date() },
    }),
    // Cascades: sessions, sign-in methods, 2FA, conversations with their runs.
    db().user.delete({ where: { id: user.id } }),
  ]);
  await audit('account.deleted', { target: `user:${user.id}` });
  return { ok: true };
}
