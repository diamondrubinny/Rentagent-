import { I18N_KEYS } from '@rentagent/core';
import { BUILTIN_LOCALES, FALLBACK_LOCALE, isSupportedLocale } from '@rentagent/shared';
import { Redis } from 'ioredis';

/**
 * Enabled locales for request routing (used by the proxy, which must stay fast:
 * no database). The web app publishes the list to Redis whenever it changes;
 * this module caches it for a few seconds. Unknown or unreachable → built-ins.
 * Pages enforce the authoritative list from the database (404 for disabled).
 */
export interface LocaleRouting {
  enabled: string[];
  defaultLocale: string;
}

const TTL_MS = 10_000;
const globalForRouting = globalThis as unknown as {
  rentagentRoutingRedis?: Redis;
  rentagentRouting?: { value: LocaleRouting; expires: number };
};

function fallbackRouting(): LocaleRouting {
  const configured = process.env.DEFAULT_LOCALE ?? '';
  return {
    enabled: [...BUILTIN_LOCALES],
    defaultLocale: (BUILTIN_LOCALES as readonly string[]).includes(configured)
      ? configured
      : FALLBACK_LOCALE,
  };
}

export function parseRouting(raw: string | null): LocaleRouting | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as { enabled?: unknown; default?: unknown };
    const enabled = Array.isArray(data.enabled) ? data.enabled.filter(isSupportedLocale) : [];
    if (enabled.length === 0) return null;
    const defaultLocale =
      typeof data.default === 'string' && enabled.includes(data.default as never)
        ? data.default
        : enabled[0]!;
    return { enabled, defaultLocale };
  } catch {
    return null;
  }
}

export async function getLocaleRouting(): Promise<LocaleRouting> {
  const cached = globalForRouting.rentagentRouting;
  if (cached && cached.expires > Date.now()) return cached.value;
  let value = fallbackRouting();
  try {
    globalForRouting.rentagentRoutingRedis ??= new Redis(process.env.REDIS_URL ?? '', {
      maxRetriesPerRequest: 1,
      connectTimeout: 2_000,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
    const redis = globalForRouting.rentagentRoutingRedis;
    if (redis.status === 'wait') await redis.connect();
    value = parseRouting(await redis.get(I18N_KEYS.routing)) ?? value;
  } catch {
    // Keep serving the built-in locales; pages still enforce the real list.
  }
  globalForRouting.rentagentRouting = { value, expires: Date.now() + TTL_MS };
  return value;
}
