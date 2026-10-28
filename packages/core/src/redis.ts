import { Redis } from 'ioredis';

const globalForRedis = globalThis as unknown as { rentagentRedis?: Redis };

/** Shared Redis connection (reused across hot reloads in development). */
export function getRedis(url: string): Redis {
  globalForRedis.rentagentRedis ??= new Redis(url, {
    // Queue commands briefly while (re)connecting, but fail fast instead of hanging requests.
    maxRetriesPerRequest: 2,
    connectTimeout: 5_000,
    enableOfflineQueue: true,
  });
  return globalForRedis.rentagentRedis;
}
