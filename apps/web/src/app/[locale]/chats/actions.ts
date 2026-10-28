'use server';

import {
  conversationTitle,
  followUpMessages,
  USER_MESSAGE_MAX_CHARS,
} from '@rentagent/agent-runtime';
import { randomUUID } from 'node:crypto';
import { settleBeforeDelete } from '@rentagent/billing';
import { enqueueRun, getServerEnv, rateLimit } from '@rentagent/core';
import {
  isSupportedLocale,
  normalizeSingleLine,
  normalizeText,
  runInputSchema,
} from '@rentagent/shared';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { audit } from '@/lib/server/audit';
import { InsufficientCreditsError, reserveCredits } from '@/lib/server/billing';
import { runnableAgent } from '@/lib/server/catalog';
import { ACTIVE_RUN_STATUSES, cancelRunAs, decideApprovalAs } from '@/lib/server/runs';
import { db, redis } from '@/lib/server/runtime';
import { getCurrentUser, type SessionUser } from '@/lib/server/session';
import { getSiteConfig } from '@/lib/server/site';

export type ChatResult =
  { ok: true; id?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

const uuid = z.uuid();
const notFound = { ok: false, error: 'notFound' } as const;
const signedOut = { ok: false, error: 'signedOut' } as const;
const refresh = () => revalidatePath('/[locale]/chats', 'layout');

async function activeUser(): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  return user && user.status === 'ACTIVE' ? user : null;
}

function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) errors[issue.path.join('.') || 'form'] ??= issue.message;
  return errors;
}

/** Burst limit per minute and the operator's daily turn limit (UTC day). */
async function checkRunQuota(userId: string): Promise<ChatResult | null> {
  const burst = await rateLimit(redis(), `user-run:${userId}`, 10, 60);
  if (!burst.allowed) return { ok: false, error: 'rateLimited' };
  const { userDailyRunLimit } = await getSiteConfig();
  if (userDailyRunLimit > 0) {
    const daily = await rateLimit(redis(), `user-run-day:${userId}`, userDailyRunLimit, 86_400);
    if (!daily.allowed) return { ok: false, error: 'dailyLimit' };
  }
  return null;
}

const localeOf = (value: string) => (isSupportedLocale(value) ? value : 'en');

/** Starts a conversation with a published agent from its task form. */
export async function startConversation(
  slug: string,
  input: Record<string, string>,
  locale: string,
): Promise<ChatResult> {
  const user = await activeUser();
  if (!user) return signedOut;
  const agent = await runnableAgent({ slug: String(slug) }, localeOf(locale));
  if (!agent) return notFound;
  const parsed = runInputSchema(agent.config.inputFields).safeParse(input);
  if (!parsed.success)
    return { ok: false, error: 'invalid', fieldErrors: fieldErrorsOf(parsed.error) };
  const quota = await checkRunQuota(user.id);
  if (quota) return quota;

  const runId = randomUUID();
  let conversationId: string;
  try {
    conversationId = await db().$transaction(async (tx) => {
      const conversation = await tx.conversation.create({
        data: {
          userId: user.id,
          agentId: agent.id,
          title: conversationTitle(parsed.data, agent.name),
        },
      });
      const billing = await reserveCredits(tx, user.id, agent.config, runId);
      await tx.run.create({
        data: {
          id: runId,
          agentId: agent.id,
          agentVersionId: agent.versionId,
          conversationId: conversation.id,
          config: agent.config as object,
          userId: user.id,
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
  refresh();
  return { ok: true, id: conversationId };
}

const messageSchema = z
  .string()
  .transform((value) => normalizeText(value).trim())
  .pipe(z.string().min(1, { error: 'required' }).max(USER_MESSAGE_MAX_CHARS, { error: 'tooLong' }));

/** Sends a follow-up message: a new run that continues the latest successful turn. */
export async function sendMessage(
  conversationId: string,
  text: string,
  locale: string,
): Promise<ChatResult> {
  const user = await activeUser();
  if (!user) return signedOut;
  if (!uuid.safeParse(conversationId).success) return notFound;
  const parsed = messageSchema.safeParse(text);
  if (!parsed.success)
    return {
      ok: false,
      error: 'invalid',
      fieldErrors: { message: parsed.error.issues[0]!.message },
    };

  const conversation = await db().conversation.findFirst({
    where: { id: conversationId, userId: user.id },
    select: { id: true, agentId: true },
  });
  if (!conversation) return notFound;
  const agent = await runnableAgent({ id: conversation.agentId }, localeOf(locale));
  if (!agent) return { ok: false, error: 'agentUnavailable' };
  if (!agent.config.conversation.followUps) return { ok: false, error: 'followUpsDisabled' };
  // Cheap pre-check so a rejected send does not use up the daily quota (re-checked under lock).
  const hasActive = await db().run.count({
    where: { conversationId: conversation.id, status: { in: [...ACTIVE_RUN_STATUSES] } },
  });
  if (hasActive > 0) return { ok: false, error: 'busy' };
  const quota = await checkRunQuota(user.id);
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
      const billing = await reserveCredits(tx, user.id, agent.config, id);
      const run = await tx.run.create({
        data: {
          id,
          ...billing,
          agentId: agent.id,
          agentVersionId: agent.versionId,
          conversationId: conversation.id,
          config: agent.config as object,
          userId: user.id,
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
  refresh();
  return { ok: true, id: runId };
}

/** The signed-in user approves or rejects an action of their own run. */
export async function decideMyApproval(approvalId: string, approve: boolean): Promise<ChatResult> {
  const user = await activeUser();
  if (!user) return signedOut;
  if (!uuid.safeParse(approvalId).success) return notFound;
  const decided = await decideApprovalAs(user.id, approvalId, approve === true);
  if (!decided.ok) return decided;
  await audit(approve === true ? 'runs.action_approved' : 'runs.action_rejected', {
    actorId: user.id,
    target: `run:${decided.runId}`,
    meta: { tool: decided.toolName },
  });
  return { ok: true };
}

async function ownRun(userId: string, runId: string) {
  if (!uuid.safeParse(runId).success) return null;
  return db().run.findFirst({
    where: { id: runId, userId, mode: 'LIVE' },
    select: { id: true, status: true },
  });
}

export async function cancelMyRun(runId: string): Promise<ChatResult> {
  const user = await activeUser();
  if (!user) return signedOut;
  if (!(await ownRun(user.id, runId))) return notFound;
  return cancelRunAs(user.id, runId);
}

const feedbackSchema = z.object({
  rating: z.union([z.literal(1), z.literal(-1), z.literal(0)]),
  feedback: z
    .string()
    .transform((value) => normalizeText(value).trim())
    .pipe(z.string().max(1000, { error: 'tooLong' })),
});

/** Helpful / not helpful (0 clears), with an optional comment for the operator. */
export async function rateRun(runId: string, input: unknown): Promise<ChatResult> {
  const user = await activeUser();
  if (!user) return signedOut;
  const run = await ownRun(user.id, runId);
  if (!run) return notFound;
  if (run.status !== 'SUCCEEDED' && run.status !== 'FAILED')
    return { ok: false, error: 'notFinished' };
  const parsed = feedbackSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: 'invalid', fieldErrors: fieldErrorsOf(parsed.error) };
  await db().run.update({
    where: { id: run.id },
    data: {
      rating: parsed.data.rating === 0 ? null : parsed.data.rating,
      feedback: parsed.data.rating === 0 ? null : parsed.data.feedback || null,
    },
  });
  return { ok: true };
}

const titleSchema = z
  .string()
  .transform(normalizeSingleLine)
  .pipe(z.string().min(1, { error: 'required' }).max(200, { error: 'tooLong' }));

export async function renameConversation(
  conversationId: string,
  title: string,
): Promise<ChatResult> {
  const user = await activeUser();
  if (!user) return signedOut;
  if (!uuid.safeParse(conversationId).success) return notFound;
  const parsed = titleSchema.safeParse(title);
  if (!parsed.success)
    return { ok: false, error: 'invalid', fieldErrors: { title: parsed.error.issues[0]!.message } };
  const { count } = await db().conversation.updateMany({
    where: { id: conversationId, userId: user.id },
    data: { title: parsed.data },
  });
  if (count === 0) return notFound;
  refresh();
  return { ok: true };
}

/** Stops active runs first so the worker does not write into deleted rows. */
async function deleteConversations(userId: string, where: { id?: string }) {
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

export async function deleteConversation(conversationId: string): Promise<ChatResult> {
  const user = await activeUser();
  if (!user) return signedOut;
  if (!uuid.safeParse(conversationId).success) return notFound;
  const { count } = await deleteConversations(user.id, { id: conversationId });
  if (count === 0) return notFound;
  refresh();
  return { ok: true };
}

/** Deletes the user's whole chat history (privacy settings). */
export async function deleteAllConversations(): Promise<ChatResult> {
  const user = await activeUser();
  if (!user) return signedOut;
  const { count } = await deleteConversations(user.id, {});
  await audit('privacy.history_deleted', { actorId: user.id, meta: { conversations: count } });
  refresh();
  return { ok: true };
}
