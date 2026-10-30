import { z } from 'zod';
import { apiError, apiJson, authenticateApi } from '@/lib/server/api-keys';
import { loadRun, runDto } from '@/lib/server/api-v1';

export const dynamic = 'force-dynamic';

/** GET /api/v1/runs/{id} — one turn (poll this, or stream /events). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = await authenticateApi(request, 'conversations:write');
  if (caller instanceof Response) return caller;
  const { id } = await params;
  const run = z.uuid().safeParse(id).success ? await loadRun(caller, id) : null;
  return run ? apiJson(200, runDto(run)) : apiError(404, 'not_found', 'Not found.');
}
