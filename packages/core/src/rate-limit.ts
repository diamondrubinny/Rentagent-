import type { Redis } from 'ioredis';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Sliding-window rate limiter backed by Redis: the previous window counts in
 * proportion to how much of it still overlaps, so bursts across a window
 * boundary cannot double the limit. Fails closed (denies) when Redis is
 * unavailable for sensitive endpoints, unless `failOpen` is set.
 */
export async function rateLimit(
  redis: Pick<Redis, 'multi'>,
  key: string,
  limit: number,
  windowSeconds: number,
  { failOpen = false, now = Date.now() }: { failOpen?: boolean; now?: number } = {},
): Promise<RateLimitResult> {
  const seconds = now / 1000;
  const window = Math.floor(seconds / windowSeconds);
  const elapsed = (seconds % windowSeconds) / windowSeconds;
  const current = `rl:${key}:${window}`;
  const previous = `rl:${key}:${window - 1}`;
  try {
    const results = await redis
      .multi()
      .incr(current)
      .expire(current, windowSeconds * 2)
      .get(previous)
      .exec();
    const count = Number(results?.[0]?.[1] ?? 0) + Number(results?.[2]?.[1] ?? 0) * (1 - elapsed);
    const allowed = count <= limit;
    return {
      allowed,
      remaining: Math.max(0, Math.floor(limit - count)),
      retryAfterSeconds: allowed ? 0 : Math.ceil(windowSeconds * (1 - elapsed)),
    };
  } catch {
    return { allowed: failOpen, remaining: 0, retryAfterSeconds: windowSeconds };
  }
}

/**
 * Atomic sliding-window consume, shaped for Better Auth's `rateLimit.customStorage`.
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
