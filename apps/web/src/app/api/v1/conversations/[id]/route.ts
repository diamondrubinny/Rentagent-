import { z } from 'zod';
import { apiError, apiJson, authenticateApi } from '@/lib/server/api-keys';
import { loadConversation } from '@/lib/server/api-v1';
import { deleteConversationsFor } from '@/lib/server/conversations';
import { db } from '@/lib/server/runtime';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };
const notFound = () => apiError(404, 'not_found', 'Not found.');

/** GET /api/v1/conversations/{id} — the conversation with all turns. */
export async function GET(request: Request, { params }: Params) {
  const caller = await authenticateApi(request, 'conversations:write');
  if (caller instanceof Response) return caller;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return notFound();
  const conversation = await loadConversation(caller, id);
  return conversation ? apiJson(200, conversation) : notFound();
}

/** DELETE /api/v1/conversations/{id} — deletes it (active turns are stopped first). */
export async function DELETE(request: Request, { params }: Params) {
  const caller = await authenticateApi(request, 'conversations:write');
  if (caller instanceof Response) return caller;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return notFound();
  // Key restrictions apply: a key limited to some agents cannot delete other chats.
  const visible = await db().conversation.count({
    where: {
      id,
      userId: caller.userId,
      ...(caller.agentIds.length ? { agentId: { in: caller.agentIds } } : {}),
    },
  });
  if (!visible) return notFound();
  const { count } = await deleteConversationsFor(caller.userId, { id });
  return count ? new Response(null, { status: 204 }) : notFound();
}
