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

/**
 * Atomic fixed-window consume, shaped for Better Auth's `rateLimit.customStorage`.
 * Fails open when Redis is unavailable so an outage does not lock everyone out;
 * sensitive app endpoints use `rateLimit` (fail closed) instead.
 */
export async function consumeRateLimit(
  redis: Pick<Redis, 'multi'>,
  key: string,
  rule: { window: number; max: number },
): Promise<{ allowed: boolean; retryAfter: number | null }> {
  const result = await rateLimit(redis, `auth:${key}`, rule.max, rule.window, { failOpen: true });
  return { allowed: result.allowed, retryAfter: result.allowed ? null : result.retryAfterSeconds };
}
