import { agentConfigSchema } from '@rentagent/shared';
import { z } from 'zod';
import { apiUser, jsonResponse } from '@/lib/server/api-auth';
import { audit } from '@/lib/server/audit';
import { db } from '@/lib/server/runtime';

export const dynamic = 'force-dynamic';

/** Downloads the agent draft as a portable JSON file (no secrets, no installation-specific ids). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser('agents.manage');
  if (!user) return jsonResponse(403, { error: 'forbidden' });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return jsonResponse(404, { error: 'not_found' });
  const agent = await db().agent.findUnique({ where: { id } });
  if (!agent) return jsonResponse(404, { error: 'not_found' });
  const config = agentConfigSchema.parse(agent.draft);
  const body = {
    format: 'rentagent.agent',
    formatVersion: 1,
    slug: agent.slug,
    name: agent.name,
    category: agent.category,
    description: agent.description,
    localizations: agent.localizations,
    config: {
      ...config,
      target: { type: 'default' },
      tools: config.tools.filter((tool) => !tool.id.includes(':')),
    },
  };
  await audit('agents.exported', { actorId: user.id, target: `agent:${id}` });
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${agent.slug}.agent.json"`,
      'cache-control': 'no-store',
    },
  });
}
