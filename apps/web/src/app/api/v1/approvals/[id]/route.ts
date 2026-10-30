import { z } from 'zod';
import { apiError, apiJson, apiResultError, authenticateApi } from '@/lib/server/api-keys';
import { loadRun, readJson, runDto } from '@/lib/server/api-v1';
import { audit } from '@/lib/server/audit';
import { db } from '@/lib/server/runtime';
import { decideApprovalAs } from '@/lib/server/runs';

export const dynamic = 'force-dynamic';

const bodySchema = z.strictObject({ approve: z.boolean() });

/** POST /api/v1/approvals/{id} — approve or reject an action an agent wants to take. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = await authenticateApi(request, 'approvals:write');
  if (caller instanceof Response) return caller;
  const { id } = await params;
  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success)
    return apiError(400, 'invalid_request', 'Expected JSON: { "approve": boolean }.');
  if (!z.uuid().safeParse(id).success) return apiError(404, 'not_found', 'Not found.');
  // The key's agent restriction applies before anything is decided.
  const approval = await db().approval.findFirst({
    where: {
      id,
      run: {
        userId: caller.userId,
        ...(caller.agentIds.length ? { agentId: { in: caller.agentIds } } : {}),
      },
    },
    select: { id: true },
  });
  if (!approval) return apiError(404, 'not_found', 'Not found.');
  const decided = await decideApprovalAs(caller.userId, id, parsed.data.approve);
  if (!decided.ok) return apiResultError(decided.error);
  await audit(parsed.data.approve ? 'runs.action_approved' : 'runs.action_rejected', {
    actorId: caller.userId,
    target: `run:${decided.runId}`,
    meta: { tool: decided.toolName, via: 'api', apiKey: caller.keyId },
  });
  const run = await loadRun(caller, decided.runId);
  return apiJson(200, run ? runDto(run) : null);
}
