import { z } from 'zod';
import { apiError } from '@/lib/server/api-keys';
import { loadRun, runDto } from '@/lib/server/api-v1';
import { runEventStream } from '@/lib/server/run-events';
import { authenticateWidget } from '@/lib/server/widget';

export const dynamic = 'force-dynamic';

/** GET /api/widget/runs/{id}/events — live updates of the visitor's own turn (SSE). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = await authenticateWidget(request);
  if (caller instanceof Response) return caller;
  const { id } = await params;
  const notFound = apiError(404, 'not_found', 'Not found.');
  if (!z.uuid().safeParse(id).success) return notFound;
  const stream = await runEventStream(request, id, async () => {
    const run = await loadRun(caller, id);
    return run ? runDto(run, { visitor: true }) : null;
  });
  return stream ?? notFound;
}
