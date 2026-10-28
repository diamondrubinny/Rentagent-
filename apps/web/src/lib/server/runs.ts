import 'server-only';
import { enqueueRun, getServerEnv } from '@rentagent/core';
import { db, redis } from './runtime';

export type DecideResult =
  | { ok: true; runId: string; toolName: string }
  | { ok: false; error: 'notFound' | 'alreadyDecided' };

/**
 * Records an approval decision and resumes the run once nothing is pending.
 * Only the account that started the run may decide: staff never approve
 * actions on a user's behalf. Unknown and foreign approvals look the same.
 */
export async function decideApprovalAs(
  actorId: string,
  approvalId: string,
  approve: boolean,
): Promise<DecideResult> {
  const decided = await db().$transaction(async (tx) => {
    const approval = await tx.approval.findUnique({
      where: { id: approvalId },
      include: { run: { select: { status: true, userId: true } } },
    });
    if (!approval || approval.run.userId !== actorId) return null;
    if (approval.status !== 'PENDING' || approval.run.status !== 'WAITING_APPROVAL')
      return 'stale' as const;
    // Conditional update: a concurrent decision on the same approval loses.
    const updated = await tx.approval.updateMany({
      where: { id: approvalId, status: 'PENDING' },
      data: {
        status: approve ? 'APPROVED' : 'REJECTED',
        decidedById: actorId,
        decidedAt: new Date(),
      },
    });
    if (updated.count === 0) return 'stale' as const;
    const stillPending = await tx.approval.count({
      where: { runId: approval.runId, status: 'PENDING' },
    });
    if (stillPending === 0)
      await tx.run.update({ where: { id: approval.runId }, data: { status: 'QUEUED' } });
    return { runId: approval.runId, resume: stillPending === 0, toolName: approval.toolName };
  });
  if (decided === null) return { ok: false, error: 'notFound' };
  if (decided === 'stale') return { ok: false, error: 'alreadyDecided' };
  if (decided.resume) await enqueueRun(getServerEnv().REDIS_URL, decided.runId);
  return { ok: true, runId: decided.runId, toolName: decided.toolName };
}

/**
 * Cancels a run: immediately when it is not executing (queued or waiting for
 * approval), otherwise by asking the worker to stop at its next step.
 */
export async function cancelRunAs(
  actorId: string,
  runId: string,
): Promise<{ ok: true } | { ok: false; error: 'notFound' | 'alreadyFinished' }> {
  const run = await db().run.findUnique({ where: { id: runId }, select: { status: true } });
  if (!run) return { ok: false, error: 'notFound' };
  if (run.status === 'WAITING_APPROVAL' || run.status === 'QUEUED') {
    await db().run.update({
      where: { id: runId },
      data: { status: 'CANCELED', cancelRequested: true, finishedAt: new Date() },
    });
    await db().approval.updateMany({
      where: { runId, status: 'PENDING' },
      data: { status: 'REJECTED', decidedById: actorId, decidedAt: new Date() },
    });
    await redis().publish(`run:${runId}`, JSON.stringify({ type: 'status', status: 'CANCELED' }));
    return { ok: true };
  }
  if (run.status === 'RUNNING') {
    await db().run.update({ where: { id: runId }, data: { cancelRequested: true } });
    return { ok: true };
  }
  return { ok: false, error: 'alreadyFinished' };
}

export const ACTIVE_RUN_STATUSES = ['QUEUED', 'RUNNING', 'WAITING_APPROVAL'] as const;
