import { toVectorLiteral, type RuntimeDeps } from '@rentagent/agent-runtime';
import { embedTexts } from '@rentagent/ai-gateway';
import { getSetting } from '@rentagent/db';
import { agentSearchDocument, agentSearchText } from '@rentagent/shared';

// Keep in sync with DEFAULT_RUN_RETENTION_DAYS in the web app.
const DEFAULT_RETENTION_DAYS = 180;

/**
 * Refreshes an agent's folded search text and, when an embedding model is set,
 * its semantic vector. Without a model the vector is cleared (stale dimensions).
 */
export async function indexAgent(deps: RuntimeDeps, agentId: string): Promise<void> {
  const { db } = deps;
  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: { id: true, name: true, description: true, localizations: true, category: true },
  });
  if (!agent) return;
  await db.agent.update({ where: { id: agentId }, data: { searchText: agentSearchText(agent) } });

  const modelId = await getSetting(db, 'ai.embeddingModelId');
  if (!modelId) {
    await db.$executeRaw`UPDATE agents SET embedding = NULL WHERE id = ${agentId}::uuid`;
    return;
  }
  const { embeddings } = await embedTexts(deps, modelId, [agentSearchDocument(agent)], {
    purpose: 'search_index',
  });
  const vector = toVectorLiteral(embeddings[0]!);
  await db.$executeRaw`UPDATE agents SET embedding = ${vector}::vector WHERE id = ${agentId}::uuid`;
}

/** Indexes every agent (after the embedding model changed, or on first start). */
export async function reindexAgents(deps: RuntimeDeps): Promise<number> {
  const agents = await deps.db.agent.findMany({ select: { id: true } });
  for (const agent of agents) {
    try {
      await indexAgent(deps, agent.id);
    } catch (error) {
      deps.log.warn(
        { agentId: agent.id, err: error instanceof Error ? error.message : String(error) },
        'agent indexing failed',
      );
    }
  }
  return agents.length;
}

/**
 * Deletes conversations (with their runs) and stand-alone runs that have not
 * changed for longer than the operator's retention period. 0 keeps everything.
 */
export async function purgeExpired(
  deps: Pick<RuntimeDeps, 'db' | 'log'>,
  now = new Date(),
): Promise<{ conversations: number; runs: number } | null> {
  const { db } = deps;
  const days = (await getSetting(db, 'privacy.runRetentionDays')) ?? DEFAULT_RETENTION_DAYS;
  if (!days || days <= 0) return null;
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const active = { notIn: ['QUEUED', 'RUNNING', 'WAITING_APPROVAL'] as never[] };
  const conversations = await db.conversation.deleteMany({
    where: { updatedAt: { lt: cutoff }, runs: { none: { status: { in: ['QUEUED', 'RUNNING'] } } } },
  });
  const runs = await db.run.deleteMany({
    where: { conversationId: null, createdAt: { lt: cutoff }, status: active },
  });
  if (conversations.count || runs.count) {
    await db.auditLog.create({
      data: {
        action: 'privacy.retention_purged',
        meta: { days, conversations: conversations.count, runs: runs.count },
      },
    });
    deps.log.info(
      { days, conversations: conversations.count, runs: runs.count },
      'retention purge',
    );
  }
  return { conversations: conversations.count, runs: runs.count };
}
