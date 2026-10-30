import 'server-only';
import {
  conversationTitle,
  followUpMessages,
  USER_MESSAGE_MAX_CHARS,
} from '@rentagent/agent-runtime';
import { randomUUID } from 'node:crypto';
import { settleBeforeDelete } from '@rentagent/billing';
import { enqueueRun, getServerEnv, rateLimit } from '@rentagent/core';
import { isSupportedLocale, normalizeText, runInputSchema } from '@rentagent/shared';
import { z } from 'zod';
import { InsufficientCreditsError, reserveCredits } from './billing';
import { runnableAgent } from './catalog';
import { ACTIVE_RUN_STATUSES } from './runs';
import { db, redis } from './runtime';
import { getSiteConfig } from './site';

/**
 * Starting and continuing conversations, shared by the web app (server actions)
 * and the public API, so quotas, credit holds and ownership checks are identical.
 */

export type ConversationResult =
  { ok: true; id: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Where a conversation comes from; API calls may be limited to some agents. */
export interface ConversationOrigin {
  source: 'WEB' | 'API';
  apiKeyId?: string;
  /** Empty or undefined = every published agent. */
  agentIds?: readonly string[];
}

const WEB: ConversationOrigin = { source: 'WEB' };
const uuid = z.uuid();
const notFound = { ok: false, error: 'notFound' } as const;

export const localeOf = (value: string) => (isSupportedLocale(value) ? value : 'en');

export function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) errors[issue.path.join('.') || 'form'] ??= issue.message;
  return errors;
}

const allowedAgent = (origin: ConversationOrigin, agentId: string) =>
  !origin.agentIds?.length || origin.agentIds.includes(agentId);

/** Burst limit per minute and the operator's daily turn limit (UTC day). */
async function checkRunQuota(userId: string): Promise<ConversationResult | null> {
  const burst = await rateLimit(redis(), `user-run:${userId}`, 10, 60);
  if (!burst.allowed) return { ok: false, error: 'rateLimited' };
  const { userDailyRunLimit } = await getSiteConfig();
  if (userDailyRunLimit > 0) {
    const daily = await rateLimit(redis(), `user-run-day:${userId}`, userDailyRunLimit, 86_400);
    if (!daily.allowed) return { ok: false, error: 'dailyLimit' };
  }
  return null;
}

/** Starts a conversation with a published agent from its task fields. */
export async function startConversationFor(
  userId: string,
  agentRef: { slug: string } | { id: string },
  input: Record<string, unknown>,
  locale: string,
  origin: ConversationOrigin = WEB,
): Promise<ConversationResult> {
  const agent = await runnableAgent(agentRef, localeOf(locale));
  if (!agent || !allowedAgent(origin, agent.id)) return notFound;
  const parsed = runInputSchema(agent.config.inputFields).safeParse(input);
  if (!parsed.success)
    return { ok: false, error: 'invalid', fieldErrors: fieldErrorsOf(parsed.error) };
  const quota = await checkRunQuota(userId);
  if (quota) return quota;

  const runId = randomUUID();
  let conversationId: string;
  try {
    conversationId = await db().$transaction(async (tx) => {
      const conversation = await tx.conversation.create({
        data: {
          userId,
          agentId: agent.id,
          title: conversationTitle(parsed.data, agent.name),
          source: origin.source,
          apiKeyId: origin.apiKeyId ?? null,
        },
      });
      const billing = await reserveCredits(tx, userId, agent.config, runId);
      await tx.run.create({
        data: {
          id: runId,
          agentId: agent.id,
          agentVersionId: agent.versionId,
          conversationId: conversation.id,
          config: agent.config as object,
          userId,
          mode: 'LIVE',
          locale: localeOf(locale),
          input: parsed.data as object,
          ...billing,
        },
      });
      return conversation.id;
    });
  } catch (error) {
    if (error instanceof InsufficientCreditsError)
      return { ok: false, error: 'insufficientCredits' };
    throw error;
  }
  await enqueueRun(getServerEnv().REDIS_URL, runId);
  return { ok: true, id: conversationId };
}

const messageSchema = z
  .string()
  .transform((value) => normalizeText(value).trim())
  .pipe(z.string().min(1, { error: 'required' }).max(USER_MESSAGE_MAX_CHARS, { error: 'tooLong' }));

/** A follow-up message: a new run that continues the latest successful turn. Returns the run id. */
export async function sendMessageFor(
  userId: string,
  conversationId: string,
  text: unknown,
  locale: string,
  origin: ConversationOrigin = WEB,
): Promise<ConversationResult> {
  if (!uuid.safeParse(conversationId).success) return notFound;
  const parsed = messageSchema.safeParse(text);
  if (!parsed.success)
    return {
      ok: false,
      error: 'invalid',
      fieldErrors: { message: parsed.error.issues[0]!.message },
    };

  // Ownership is part of the query.
  const conversation = await db().conversation.findFirst({
    where: { id: conversationId, userId },
    select: { id: true, agentId: true },
  });
  if (!conversation || !allowedAgent(origin, conversation.agentId)) return notFound;
  const agent = await runnableAgent({ id: conversation.agentId }, localeOf(locale));
  if (!agent) return { ok: false, error: 'agentUnavailable' };
  if (!agent.config.conversation.followUps) return { ok: false, error: 'followUpsDisabled' };
  // Cheap pre-check so a rejected send does not use up the daily quota (re-checked under lock).
  const hasActive = await db().run.count({
    where: { conversationId: conversation.id, status: { in: [...ACTIVE_RUN_STATUSES] } },
  });
  if (hasActive > 0) return { ok: false, error: 'busy' };
  const quota = await checkRunQuota(userId);
  if (quota) return quota;

  let runId: string | null;
  try {
    runId = await db().$transaction(async (tx) => {
      // Serializes concurrent sends in the same conversation.
      await tx.$queryRaw`SELECT id FROM conversations WHERE id = ${conversation.id}::uuid FOR UPDATE`;
      const active = await tx.run.count({
        where: { conversationId: conversation.id, status: { in: [...ACTIVE_RUN_STATUSES] } },
      });
      if (active > 0) return null;
      const previous = await tx.run.findFirst({
        where: { conversationId: conversation.id, status: 'SUCCEEDED' },
        orderBy: { createdAt: 'desc' },
        select: { messages: true },
      });
      const messages = followUpMessages(previous?.messages ?? [], parsed.data, {
        historyTurns: agent.config.conversation.historyTurns,
      });
      const id = randomUUID();
      const billing = await reserveCredits(tx, userId, agent.config, id);
      const run = await tx.run.create({
        data: {
          id,
          ...billing,
          agentId: agent.id,
          agentVersionId: agent.versionId,
          conversationId: conversation.id,
          config: agent.config as object,
          userId,
          mode: 'LIVE',
          locale: localeOf(locale),
          input: {},
          userMessage: parsed.data,
          messages: messages as never,
        },
      });
      await tx.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      });
      return run.id;
    });
  } catch (error) {
    if (error instanceof InsufficientCreditsError)
      return { ok: false, error: 'insufficientCredits' };
    throw error;
  }
  if (!runId) return { ok: false, error: 'busy' };
  await enqueueRun(getServerEnv().REDIS_URL, runId);
  return { ok: true, id: runId };
}

/** The user's own live run (ownership in the query), or null. */
export async function ownRun(userId: string, runId: string) {
  if (!uuid.safeParse(runId).success) return null;
  return db().run.findFirst({
    where: { id: runId, userId, mode: 'LIVE' },
    select: { id: true, status: true, agentId: true },
  });
}

/** Stops active runs first so the worker does not write into deleted rows. */
export async function deleteConversationsFor(userId: string, where: { id?: string }) {
  // Credits held by these runs are settled before the rows disappear.
  const held = await db().run.findMany({
    where: { userId, conversation: { userId, ...where }, settledAt: null, holdMinor: { gt: 0n } },
    select: { id: true },
  });
  await settleBeforeDelete(
    db(),
    held.map((run) => run.id),
  );
  await db().run.updateMany({
    where: {
      userId,
      conversation: { userId, ...where },
      status: { in: [...ACTIVE_RUN_STATUSES] },
    },
    data: { cancelRequested: true, status: 'CANCELED', finishedAt: new Date() },
  });
  return db().conversation.deleteMany({ where: { userId, ...where } });
}
