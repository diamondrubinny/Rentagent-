import { z } from 'zod';
import { apiError, apiJson, apiResultError, authenticateApi } from '@/lib/server/api-keys';
import { loadConversation, readJson } from '@/lib/server/api-v1';
import { startConversationFor } from '@/lib/server/conversations';
import { db } from '@/lib/server/runtime';

export const dynamic = 'force-dynamic';

const createSchema = z.strictObject({
  agent: z.string().min(1).max(100),
  input: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
  locale: z.string().max(35).optional(),
});

/** POST /api/v1/conversations — starts a conversation (the first turn runs immediately). */
export async function POST(request: Request) {
  const caller = await authenticateApi(request, 'conversations:write');
  if (caller instanceof Response) return caller;
  const parsed = createSchema.safeParse(await readJson(request));
  if (!parsed.success)
    return apiError(400, 'invalid_request', 'Expected JSON: { "agent": slug, "input": {…} }.');
  const { agent, input, locale } = parsed.data;
  const fields = Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, String(value)]),
  );
  const ref = z.uuid().safeParse(agent).success ? { id: agent } : { slug: agent };
  const result = await startConversationFor(caller.userId, ref, fields, locale ?? caller.locale, {
    source: 'API',
    apiKeyId: caller.apiKeyId,
    agentIds: caller.agentIds,
  });
  if (!result.ok) return apiResultError(result.error, result.fieldErrors);
  return apiJson(201, await loadConversation(caller, result.id));
}

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  before: z.iso.datetime({ offset: true }).optional(),
});

/** GET /api/v1/conversations — the key owner's conversations, newest first (cursor: before). */
export async function GET(request: Request) {
  const caller = await authenticateApi(request, 'conversations:write');
  if (caller instanceof Response) return caller;
  const query = listSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) return apiError(400, 'invalid_request', 'Invalid limit or before.');
  const rows = await db().conversation.findMany({
    where: {
      userId: caller.userId,
      ...(caller.agentIds.length ? { agentId: { in: caller.agentIds } } : {}),
      ...(query.data.before ? { updatedAt: { lt: new Date(query.data.before) } } : {}),
    },
    orderBy: { updatedAt: 'desc' },
    take: query.data.limit,
    select: {
      id: true,
      title: true,
      source: true,
      createdAt: true,
      updatedAt: true,
      agent: { select: { id: true, slug: true, name: true } },
    },
  });
  return apiJson(200, {
    data: rows.map((row) => ({ ...row, source: row.source.toLowerCase() })),
    next: rows.length === query.data.limit ? rows.at(-1)!.updatedAt.toISOString() : null,
  });
}
