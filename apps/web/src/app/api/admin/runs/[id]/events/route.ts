import { z } from 'zod';
import { apiUser, jsonResponse } from '@/lib/server/api-auth';
import { runEventStream } from '@/lib/server/run-events';
import { db } from '@/lib/server/runtime';

export const dynamic = 'force-dynamic';

async function snapshot(runId: string) {
  const run = await db().run.findUnique({
    where: { id: runId },
    include: {
      steps: { orderBy: { idx: 'asc' } },
      approvals: { orderBy: { createdAt: 'asc' } },
      agent: { select: { name: true } },
    },
  });
  if (!run) return null;
  return {
    id: run.id,
    agentName: run.agent.name,
    mode: run.mode,
    ownerId: run.userId,
    status: run.status,
    errorKind: run.errorKind,
    output: run.output,
    input: run.input,
    costMicros: run.costMicros,
    inputTokens: run.inputTokens,
    outputTokens: run.outputTokens,
    steps: run.steps.map((step) => ({
      idx: step.idx,
      stepType: step.type,
      toolName: step.toolName,
      ok: step.ok,
      detail: step.detail,
    })),
    approvals: run.approvals.map((approval) => ({
      id: approval.id,
      toolName: approval.toolName,
      input: approval.input,
      status: approval.status,
    })),
  };
}

/** Live run updates for staff (full trace). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser('agents.manage');
  if (!user) return jsonResponse(403, { error: 'forbidden' });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return jsonResponse(404, { error: 'not_found' });
  return (
    (await runEventStream(request, id, () => snapshot(id))) ??
    jsonResponse(404, { error: 'not_found' })
  );
}
