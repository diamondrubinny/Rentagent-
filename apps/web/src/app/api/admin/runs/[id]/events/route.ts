import { getServerEnv } from '@rentagent/core';
import { Redis } from 'ioredis';
import { z } from 'zod';
import { apiUser, jsonResponse } from '@/lib/server/api-auth';
import { db } from '@/lib/server/runtime';

export const dynamic = 'force-dynamic';

const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'CANCELED']);
const stringify = (value: unknown) =>
  JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v));

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

/**
 * Live run updates as Server-Sent Events. Every event triggers a fresh snapshot
 * from the database, so the client always renders consistent state.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser('agents.manage');
  if (!user) return jsonResponse(403, { error: 'forbidden' });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return jsonResponse(404, { error: 'not_found' });
  const first = await snapshot(id);
  if (!first) return jsonResponse(404, { error: 'not_found' });

  const encoder = new TextEncoder();
  const subscriber = new Redis(getServerEnv().REDIS_URL, { maxRetriesPerRequest: 3 });
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (data: unknown) => {
        if (!closed) controller.enqueue(encoder.encode(`data: ${stringify(data)}\n\n`));
      };
      const close = async () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        await subscriber.quit().catch(() => undefined);
        controller.close();
      };
      send(first);
      if (TERMINAL.has(first.status)) return close();

      subscriber.on('message', async () => {
        const next = await snapshot(id);
        if (!next) return close();
        send(next);
        if (TERMINAL.has(next.status)) await close();
      });
      await subscriber.subscribe(`run:${id}`);
      // Catch updates that happened between the first snapshot and subscribing.
      const latest = await snapshot(id);
      if (latest) send(latest);
      heartbeat = setInterval(
        () => !closed && controller.enqueue(encoder.encode(': keep-alive\n\n')),
        15_000,
      );
      request.signal.addEventListener('abort', () => void close());
    },
    async cancel() {
      closed = true;
      clearInterval(heartbeat);
      await subscriber.quit().catch(() => undefined);
    },
  });

  return new Response(body, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      'x-accel-buffering': 'no',
    },
  });
}
