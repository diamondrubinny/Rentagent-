import { z } from 'zod';
import { apiError, apiJson } from '@/lib/server/api-keys';
import { loadConversation } from '@/lib/server/api-v1';
import { authenticateWidget } from '@/lib/server/widget';

export const dynamic = 'force-dynamic';

/** GET /api/widget/conversations/{id} — the visitor's own conversation only. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = await authenticateWidget(request);
  if (caller instanceof Response) return caller;
  const { id } = await params;
  const conversation = z.uuid().safeParse(id).success ? await loadConversation(caller, id) : null;
  return conversation ? apiJson(200, conversation) : apiError(404, 'not_found', 'Not found.');
}
