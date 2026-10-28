import { NextResponse } from 'next/server';
import { db, redis } from '@/lib/server/runtime';

export const dynamic = 'force-dynamic';

const WORKER_HEARTBEAT_KEY = 'worker:heartbeat';

async function check(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch {
    return false;
  }
}

/**
 * Liveness/readiness probe. Returns only booleans, never versions, hosts or errors.
 * 503 when a hard dependency (database, redis) is down; "degraded" when only the worker is.
 */
export async function GET() {
  const [database, cache] = await Promise.all([
    check(() => db().$queryRaw`SELECT 1`),
    check(() => redis().ping()),
  ]);
  const worker =
    cache &&
    (await check(async () => {
      if (!(await redis().exists(WORKER_HEARTBEAT_KEY))) throw new Error('stale');
    }));

  const healthy = database && cache;
  return NextResponse.json(
    {
      status: healthy ? (worker ? 'ok' : 'degraded') : 'error',
      checks: { database, redis: cache, worker },
    },
    { status: healthy ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
