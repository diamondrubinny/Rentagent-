import 'server-only';
import { randomBytes } from 'node:crypto';
import { decryptSecret, encryptSecret, getServerEnv } from '@rentagent/core';
import { getBranding } from './branding';
import { encryptionKeyring } from './runtime';

/** Scheduled tasks are an operator opt-in feature. */
export async function schedulesEnabled(): Promise<boolean> {
  return (await getBranding()).features.schedules;
}

const context = (triggerId: string) => `schedule-trigger:${triggerId}`;

/** A trigger URL id and its HMAC secret (shown once, stored encrypted). */
export function createTrigger(): { triggerId: string; secret: string; encrypted: string } {
  const triggerId = randomBytes(12).toString('hex');
  const secret = `whsec_${randomBytes(32).toString('base64url')}`;
  return {
    triggerId,
    secret,
    encrypted: encryptSecret(secret, context(triggerId), encryptionKeyring()),
  };
}

export function triggerSecret(triggerId: string, encrypted: string): string {
  return decryptSecret(encrypted, context(triggerId), encryptionKeyring());
}

export function triggerUrl(triggerId: string): string {
  return `${getServerEnv().APP_URL.replace(/\/$/, '')}/api/hooks/schedules/${triggerId}`;
}
