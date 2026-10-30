import { z } from 'zod';
import { apiError, apiJson, apiResultError } from '@/lib/server/api-keys';
import { loadConversation, readJson } from '@/lib/server/api-v1';
import { startConversationFor } from '@/lib/server/conversations';
import { authenticateWidget } from '@/lib/server/widget';

export const dynamic = 'force-dynamic';

const bodySchema = z.strictObject({
  input: z.record(z.string(), z.string().max(20_000)),
  locale: z.string().max(35),
});

/** POST /api/widget/conversations — a visitor starts a conversation with the key's agent. */
export async function POST(request: Request) {
  const caller = await authenticateWidget(request);
  if (caller instanceof Response) return caller;
  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) return apiError(400, 'invalid_request', 'Invalid request.');
  const result = await startConversationFor(
    caller.userId,
    { id: caller.agentIds[0]! },
    parsed.data.input,
    parsed.data.locale,
    {
      source: 'WIDGET',
      apiKeyId: caller.apiKeyId,
      agentIds: caller.agentIds,
      visitorId: caller.visitorId,
      dailyRunLimit: caller.dailyRunLimit,
    },
  );
  if (!result.ok) return apiResultError(result.error, result.fieldErrors);
  return apiJson(201, await loadConversation(caller, result.id));
}
