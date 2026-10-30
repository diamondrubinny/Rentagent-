import 'server-only';
import type { ApiCaller } from './api-keys';
import { agentPriceLabel } from './billing';
import type { RunnableAgent } from './catalog';
import { db } from './runtime';

/** Public API request bodies are small JSON documents. */
export const MAX_BODY_BYTES = 64 * 1024;

/** Reads a JSON body with a size limit; null when missing, too large or not JSON. */
export async function readJson(request: Request): Promise<unknown | null> {
  if (!/^application\/json\b/i.test(request.headers.get('content-type') ?? '')) return null;
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) return null;
  const text = await request.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export async function agentDto(agent: RunnableAgent) {
  const price = await agentPriceLabel(agent.config);
  return {
    id: agent.id,
    slug: agent.slug,
    name: agent.name,
    description: agent.description,
    category: agent.category,
    inputFields: agent.config.inputFields.map((field) => ({
      key: field.key,
      label: field.label,
      type: field.type,
      required: field.required,
      ...(field.type === 'select' ? { options: field.options } : {}),
    })),
    followUps: agent.config.conversation.followUps,
    price: price
      ? { mode: price.mode, amountMinor: price.amountMinor.toString(), currency: price.currency }
      : null,
  };
}

const runInclude = {
  steps: {
    where: { type: 'TOOL' as const },
    orderBy: { idx: 'asc' as const },
    select: { toolName: true, ok: true },
  },
  approvals: { orderBy: { createdAt: 'asc' as const } },
};

type RunRow = Awaited<ReturnType<typeof loadRun>> & object;

/** One turn as the API shows it: no model/provider names or internal costs. */
/** `visitor`: a widget visitor's view, without what the site owner is charged. */
export function runDto(run: NonNullable<RunRow>, { visitor = false }: { visitor?: boolean } = {}) {
  return {
    id: run.id,
    conversationId: run.conversationId,
    status: run.status,
    message: run.userMessage,
    input: run.userMessage === null ? run.input : null,
    output: run.output,
    error: run.errorKind,
    tools: run.steps.map((step) => ({ name: step.toolName, ok: step.ok })),
    approvals: run.approvals.map((approval) => ({
      id: approval.id,
      tool: approval.toolName,
      input: approval.input,
      status: approval.status,
    })),
    ...(visitor ? {} : { chargedMinor: run.chargedMinor.toString() }),
    createdAt: run.createdAt,
    finishedAt: run.finishedAt,
  };
}

/** The caller's run (ownership and key restrictions are part of the query). */
export async function loadRun(caller: ApiCaller, runId: string) {
  return db().run.findFirst({
    where: {
      id: runId,
      userId: caller.userId,
      mode: 'LIVE',
      ...(caller.agentIds.length ? { agentId: { in: caller.agentIds } } : {}),
      ...(caller.visitorId
        ? { conversation: { apiKeyId: caller.apiKeyId, visitorId: caller.visitorId } }
        : {}),
    },
    include: runInclude,
  });
}

export async function loadConversation(caller: ApiCaller, conversationId: string) {
  const conversation = await db().conversation.findFirst({
    where: {
      id: conversationId,
      userId: caller.userId,
      ...(caller.agentIds.length ? { agentId: { in: caller.agentIds } } : {}),
      ...(caller.visitorId ? { apiKeyId: caller.apiKeyId, visitorId: caller.visitorId } : {}),
    },
    include: {
      agent: { select: { id: true, slug: true, name: true } },
      runs: { orderBy: { createdAt: 'asc' }, include: runInclude },
    },
  });
  if (!conversation) return null;
  return {
    id: conversation.id,
    title: conversation.title,
    source: conversation.source.toLowerCase(),
    agent: conversation.agent,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    turns: conversation.runs.map((run) => runDto(run, { visitor: Boolean(caller.visitorId) })),
  };
}
