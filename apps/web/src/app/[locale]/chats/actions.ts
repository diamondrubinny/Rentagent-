'use server';

import { normalizeSingleLine, normalizeText } from '@rentagent/shared';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { audit } from '@/lib/server/audit';
import { getBranding } from '@/lib/server/branding';
import {
  deleteConversationsFor,
  fieldErrorsOf,
  ownRun,
  sendMessageFor,
  startConversationFor,
} from '@/lib/server/conversations';
import { cancelRunAs, decideApprovalAs } from '@/lib/server/runs';
import { db } from '@/lib/server/runtime';
import { getCurrentUser, type SessionUser } from '@/lib/server/session';

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

/** Starts a conversation with a published agent from its task form. */
export async function startConversation(
  slug: string,
  input: Record<string, string>,
  locale: string,
): Promise<ChatResult> {
  const user = await activeUser();
  if (!user) return signedOut;
  const result = await startConversationFor(user.id, { slug: String(slug) }, input, locale);
  if (result.ok) refresh();
  return result;
}

/** Sends a follow-up message: a new run that continues the latest successful turn. */
export async function sendMessage(
  conversationId: string,
  text: string,
  locale: string,
): Promise<ChatResult> {
  const user = await activeUser();
  if (!user) return signedOut;
  const result = await sendMessageFor(user.id, conversationId, text, locale);
  if (result.ok) refresh();
  return result;
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
  if (!(await getBranding()).features.feedback) return { ok: false, error: 'feedbackDisabled' };
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

export async function deleteConversation(conversationId: string): Promise<ChatResult> {
  const user = await activeUser();
  if (!user) return signedOut;
  if (!uuid.safeParse(conversationId).success) return notFound;
  const { count } = await deleteConversationsFor(user.id, { id: conversationId });
  if (count === 0) return notFound;
  refresh();
  return { ok: true };
}

/** Deletes the user's whole chat history (privacy settings). */
export async function deleteAllConversations(): Promise<ChatResult> {
  const user = await activeUser();
  if (!user) return signedOut;
  const { count } = await deleteConversationsFor(user.id, {});
  await audit('privacy.history_deleted', { actorId: user.id, meta: { conversations: count } });
  refresh();
  return { ok: true };
}
