import 'server-only';
import { createHmac } from 'node:crypto';
import { getLogger, getRedis, getServerEnv, parseKeyring, type Keyring } from '@rentagent/core';
import { getDb } from '@rentagent/db';
import { headers } from 'next/headers';

export function db() {
  return getDb(getServerEnv().DATABASE_URL);
}

export function redis() {
  return getRedis(getServerEnv().REDIS_URL);
}

let keyring: Keyring | undefined;
export function encryptionKeyring(): Keyring {
  const env = getServerEnv();
  keyring ??= parseKeyring(env.APP_ENCRYPTION_KEY, env.APP_ENCRYPTION_KEYS_PREVIOUS);
  return keyring;
}

export const logger = () => getLogger({ service: 'web' });

/**
 * Client IP as reported by the reverse proxy. Caddy overwrites X-Forwarded-For
 * by default, so the right-most value is the address that connected to it.
 */
export async function clientIp(): Promise<string> {
  const forwarded = (await headers()).get('x-forwarded-for') ?? '';
  return (
    forwarded
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .at(-1) ?? 'unknown'
  );
}

/** Pseudonymized IP for logs and rate-limit keys (keyed hash, not reversible without the key). */
export async function clientIpHash(): Promise<string> {
  return createHmac('sha256', encryptionKeyring().current)
    .update(`ip:${await clientIp()}`)
    .digest('hex')
    .slice(0, 32);
}
