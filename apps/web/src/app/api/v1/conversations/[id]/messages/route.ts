import { z } from 'zod';
import { apiError, apiJson, apiResultError, authenticateApi } from '@/lib/server/api-keys';
import { loadRun, readJson, runDto } from '@/lib/server/api-v1';
import { sendMessageFor } from '@/lib/server/conversations';

export const dynamic = 'force-dynamic';

const bodySchema = z.strictObject({ message: z.string(), locale: z.string().max(35).optional() });

/** POST /api/v1/conversations/{id}/messages — a follow-up turn; returns the new run. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = await authenticateApi(request, 'conversations:write');
  if (caller instanceof Response) return caller;
  const { id } = await params;
  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success)
    return apiError(400, 'invalid_request', 'Expected JSON: { "message": text }.');
  const result = await sendMessageFor(
    caller.userId,
    id,
    parsed.data.message,
    parsed.data.locale ?? caller.locale,
    { source: 'API', apiKeyId: caller.apiKeyId, agentIds: caller.agentIds },
  );
  if (!result.ok) return apiResultError(result.error, result.fieldErrors);
  const run = await loadRun(caller, result.id);
  return apiJson(201, run ? runDto(run) : { id: result.id });
}
