import { z } from 'zod';
import { apiError, apiJson, apiResultError } from '@/lib/server/api-keys';
import { loadRun, readJson, runDto } from '@/lib/server/api-v1';
import { sendMessageFor } from '@/lib/server/conversations';
import { authenticateWidget } from '@/lib/server/widget';

export const dynamic = 'force-dynamic';

const bodySchema = z.strictObject({ message: z.string(), locale: z.string().max(35) });

/** POST /api/widget/conversations/{id}/messages — a follow-up from the visitor. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = await authenticateWidget(request);
  if (caller instanceof Response) return caller;
  const { id } = await params;
  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) return apiError(400, 'invalid_request', 'Invalid request.');
  const result = await sendMessageFor(caller.userId, id, parsed.data.message, parsed.data.locale, {
    source: 'WIDGET',
    apiKeyId: caller.apiKeyId,
    agentIds: caller.agentIds,
    visitorId: caller.visitorId,
    dailyRunLimit: caller.dailyRunLimit,
  });
  if (!result.ok) return apiResultError(result.error, result.fieldErrors);
  const run = await loadRun(caller, result.id);
  return apiJson(201, run ? runDto(run, { visitor: true }) : { id: result.id });
}
