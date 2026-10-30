import { apiJson, authenticateApi } from '@/lib/server/api-keys';
import { agentDto } from '@/lib/server/api-v1';
import { runnableAgents } from '@/lib/server/catalog';

export const dynamic = 'force-dynamic';

/** GET /api/v1/agents — published agents this key may use, with their input fields. */
export async function GET(request: Request) {
  const caller = await authenticateApi(request, 'agents:read');
  if (caller instanceof Response) return caller;
  const locale = new URL(request.url).searchParams.get('locale') ?? caller.locale;
  const agents = await runnableAgents(locale, caller.agentIds);
  return apiJson(200, { data: await Promise.all(agents.map(agentDto)) });
}
