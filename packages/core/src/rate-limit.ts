import type { Redis } from 'ioredis';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Fixed-window rate limiter backed by Redis. Fails closed (denies) when Redis
 * is unavailable for sensitive endpoints, unless `failOpen` is set.
 */
export async function rateLimit(
  redis: Pick<Redis, 'multi'>,
  key: string,
  limit: number,
  windowSeconds: number,
  { failOpen = false }: { failOpen?: boolean } = {},
): Promise<RateLimitResult> {
  const bucket = `rl:${key}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;
  try {
    const results = await redis.multi().incr(bucket).expire(bucket, windowSeconds).exec();
    const count = Number(results?.[0]?.[1] ?? 0);
    const allowed = count <= limit;
    return {
      allowed,
      remaining: Math.max(0, limit - count),
      retryAfterSeconds: allowed
        ? 0
        : windowSeconds - (Math.floor(Date.now() / 1000) % windowSeconds),
    };
  } catch {
    return { allowed: failOpen, remaining: 0, retryAfterSeconds: windowSeconds };
  }
}
