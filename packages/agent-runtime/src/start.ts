import { randomUUID } from 'node:crypto';
import { type BillingConfig, reserveRunCredits } from '@rentagent/billing';
import type { PrismaClient } from '@rentagent/db';
import { type AgentConfig, agentConfigSchema, localizedAgent } from '@rentagent/shared';
import { conversationTitle } from './conversation';

export interface RunnableAgent {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  featured: boolean;
  versionId: string;
  config: AgentConfig;
}

const published = { status: 'PUBLISHED' as const, publishedVersionId: { not: null } };

/** A published agent with its current published configuration, or null. */
export async function loadRunnableAgent(
  db: PrismaClient,
  where: { slug: string } | { id: string },
  locale: string,
): Promise<RunnableAgent | null> {
  const agent = await db.agent.findFirst({
    where: { ...where, ...published },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      localizations: true,
      category: true,
      featured: true,
      publishedVersionId: true,
    },
  });
  if (!agent?.publishedVersionId) return null;
  const version = await db.agentVersion.findUnique({ where: { id: agent.publishedVersionId } });
  const parsed = agentConfigSchema.safeParse(version?.config);
  if (!version || !parsed.success) return null;
  return {
    id: agent.id,
    slug: agent.slug,
    category: agent.category,
    featured: agent.featured,
    ...localizedAgent(agent, locale),
    versionId: version.id,
    config: parsed.data,
  };
}

export interface FirstTurn {
  userId: string;
  agent: RunnableAgent;
  /** Validated task fields. */
  input: Record<string, unknown>;
  locale: string;
  source: 'WEB' | 'API' | 'WIDGET' | 'SCHEDULE';
  apiKeyId?: string | null;
  visitorId?: string | null;
  scheduleId?: string | null;
}

/**
 * Creates a conversation and its first run with the credit hold, in one transaction.
 * The caller enqueues the run. Throws InsufficientCreditsError.
 */
export async function createFirstTurn(
  db: PrismaClient,
  billing: BillingConfig,
  turn: FirstTurn,
): Promise<{ conversationId: string; runId: string }> {
  const runId = randomUUID();
  const conversationId = await db.$transaction(async (tx) => {
    const conversation = await tx.conversation.create({
      data: {
        userId: turn.userId,
        agentId: turn.agent.id,
        title: conversationTitle(turn.input, turn.agent.name),
        source: turn.source,
        apiKeyId: turn.apiKeyId ?? null,
        visitorId: turn.visitorId ?? null,
        scheduleId: turn.scheduleId ?? null,
      },
    });
    const hold = await reserveRunCredits(
      tx,
      billing,
      turn.userId,
      turn.agent.config.pricing,
      runId,
    );
    await tx.run.create({
      data: {
        id: runId,
        agentId: turn.agent.id,
        agentVersionId: turn.agent.versionId,
        conversationId: conversation.id,
        config: turn.agent.config as object,
        userId: turn.userId,
        mode: 'LIVE',
        locale: turn.locale,
        input: turn.input as object,
        ...hold,
      },
    });
    return conversation.id;
  });
  return { conversationId, runId };
}
