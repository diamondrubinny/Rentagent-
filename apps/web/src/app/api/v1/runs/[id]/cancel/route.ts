import { z } from 'zod';
import { apiError, apiJson, apiResultError, authenticateApi } from '@/lib/server/api-keys';
import { loadRun, runDto } from '@/lib/server/api-v1';
import { cancelRunAs } from '@/lib/server/runs';

export const dynamic = 'force-dynamic';

/** POST /api/v1/runs/{id}/cancel — stops an active turn; unused credits are released. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = await authenticateApi(request, 'conversations:write');
  if (caller instanceof Response) return caller;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success || !(await loadRun(caller, id)))
    return apiError(404, 'not_found', 'Not found.');
  const result = await cancelRunAs(caller.userId, id);
  if (!result.ok) return apiResultError(result.error);
  const run = await loadRun(caller, id);
  return apiJson(200, run ? runDto(run) : null);
}
