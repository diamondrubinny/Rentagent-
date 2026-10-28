import { z } from 'zod';
import { apiActiveUser, jsonResponse } from '@/lib/server/api-auth';
import { runEventStream } from '@/lib/server/run-events';
import { db } from '@/lib/server/runtime';

export const dynamic = 'force-dynamic';

/**
 * What the run's owner sees: status, answer, tool activity and pending approvals.
 * No model/provider names, costs or raw tool payloads (white-label, operator data).
 */
async function ownerSnapshot(runId: string, userId: string) {
  const run = await db().run.findFirst({
    where: { id: runId, userId, mode: 'LIVE' },
    include: {
      steps: { where: { type: { in: ['TOOL', 'APPROVAL'] } }, orderBy: { idx: 'asc' } },
      approvals: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!run) return null;
  return {
    id: run.id,
    status: run.status,
    errorKind: run.errorKind,
    output: run.output,
    steps: run.steps
      .filter((step) => step.type === 'TOOL')
      .map((step) => ({ idx: step.idx, toolName: step.toolName, ok: step.ok })),
    approvals: run.approvals.map((approval) => ({
      id: approval.id,
      toolName: approval.toolName,
      input: approval.input,
      status: approval.status,
    })),
  };
}

export type OwnerRunSnapshot = NonNullable<Awaited<ReturnType<typeof ownerSnapshot>>>;

/** Live updates of the signed-in user's own run; anything else is a 404. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiActiveUser();
  if (!user) return jsonResponse(401, { error: 'unauthorized' });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return jsonResponse(404, { error: 'not_found' });
  return (
    (await runEventStream(request, id, () => ownerSnapshot(id, user.id))) ??
    jsonResponse(404, { error: 'not_found' })
  );
}
