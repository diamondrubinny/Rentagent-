import { describe, expect, it } from 'vitest';
import { rateLimit } from '../src/rate-limit';

/** Minimal in-memory stand-in for the Redis MULTI calls the limiter uses. */
function fakeRedis() {
  const store = new Map<string, number>();
  return {
    store,
    multi() {
      const ops: (() => unknown)[] = [];
      const chain = {
        incr(key: string) {
          ops.push(() => {
            store.set(key, (store.get(key) ?? 0) + 1);
            return store.get(key);
          });
          return chain;
        },
        expire() {
          ops.push(() => 1);
          return chain;
        },
        get(key: string) {
          ops.push(() => (store.has(key) ? String(store.get(key)) : null));
          return chain;
        },
        async exec() {
          return ops.map((op) => [null, op()]);
        },
      };
      return chain;
    },
  };
}

describe('rateLimit (sliding window)', () => {
  const start = 1_800_000_000_000; // aligned to a 60 s window

  it('allows up to the limit inside a window', async () => {
    const redis = fakeRedis();
    const results = [];
    for (let i = 0; i < 6; i++)
      results.push(await rateLimit(redis as never, 'k', 5, 60, { now: start + i * 1000 }));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, true, true, false]);
    expect(results[5]!.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('does not reset at a window boundary (no double burst)', async () => {
    const redis = fakeRedis();
    for (let i = 0; i < 5; i++)
      await rateLimit(redis as never, 'k', 5, 60, { now: start + 55_000 + i * 500 });
    // One second into the next window the previous one still counts almost fully.
    const next = await rateLimit(redis as never, 'k', 5, 60, { now: start + 61_000 });
    expect(next.allowed).toBe(false);
  });

  it('frees capacity as the previous window slides out', async () => {
    const redis = fakeRedis();
    for (let i = 0; i < 5; i++)
      await rateLimit(redis as never, 'k', 5, 60, { now: start + i * 1000 });
    const later = await rateLimit(redis as never, 'k', 5, 60, { now: start + 60_000 + 50_000 });
    expect(later.allowed).toBe(true);
  });

  it('fails closed unless failOpen is set', async () => {
    const broken = {
      multi: () => {
        throw new Error('down');
      },
    };
    expect((await rateLimit(broken as never, 'k', 5, 60)).allowed).toBe(false);
    expect((await rateLimit(broken as never, 'k', 5, 60, { failOpen: true })).allowed).toBe(true);
  });
});
