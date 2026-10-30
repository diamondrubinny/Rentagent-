import { z } from 'zod';
import { apiError, authenticateApi } from '@/lib/server/api-keys';
import { loadRun, runDto } from '@/lib/server/api-v1';
import { runEventStream } from '@/lib/server/run-events';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/runs/{id}/events — Server-Sent Events: a full run snapshot on every
 * change (default event) and streamed answer text (`event: partial`). Ends when the
 * run finishes.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = await authenticateApi(request, 'conversations:write');
  if (caller instanceof Response) return caller;
  const { id } = await params;
  const notFound = apiError(404, 'not_found', 'Not found.');
  if (!z.uuid().safeParse(id).success) return notFound;
  const stream = await runEventStream(request, id, async () => {
    const run = await loadRun(caller, id);
    return run ? runDto(run) : null;
  });
  return stream ?? notFound;
}
