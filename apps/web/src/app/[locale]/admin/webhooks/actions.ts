'use server';

import { randomBytes } from 'node:crypto';
import { checkEndpointUrl } from '@rentagent/ai-gateway';
import { encryptSecret, enqueueWebhookDelivery, getServerEnv } from '@rentagent/core';
import { emitWebhookEvent, isWebhookEvent } from '@rentagent/webhooks';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { authorizeAction } from '@/lib/server/admin-action';
import { audit } from '@/lib/server/audit';
import { db, encryptionKeyring, logger } from '@/lib/server/runtime';

export type WebhookResult =
  | { ok: true; secret?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const forbidden = { ok: false, error: 'forbidden' } as const;
const uuid = z.uuid();
const MAX_WEBHOOKS = 20;
const refresh = () => revalidatePath('/[locale]/admin/webhooks', 'page');
const newSecret = () => `rawh_${randomBytes(32).toString('base64url')}`;

async function validUrl(raw: string): Promise<string | { error: string }> {
  const value = String(raw ?? '').trim();
  if (value.length > 2000) return { error: 'tooLong' };
  const check = await checkEndpointUrl(value);
  if (!check.ok) return { error: `url_${check.reason}` };
  // Keep the operator's exact URL (query strings are common for webhook receivers).
  return new URL(value).toString();
}

export async function createWebhook(input: {
  url: string;
  description: string;
  events: string[];
}): Promise<WebhookResult> {
  const actor = await authorizeAction('settings.manage');
  if (!actor) return forbidden;
  const url = await validUrl(input.url);
  if (typeof url !== 'string')
    return { ok: false, error: 'invalid', fieldErrors: { url: url.error } };
  const events = [...new Set((input.events ?? []).filter(isWebhookEvent))];
  if (events.length === 0)
    return { ok: false, error: 'invalid', fieldErrors: { events: 'required' } };
  if ((await db().webhook.count()) >= MAX_WEBHOOKS) return { ok: false, error: 'tooMany' };
  const secret = newSecret();
  const hook = await db().webhook.create({
    data: {
      url,
      events,
      description: String(input.description ?? '')
        .trim()
        .slice(0, 200),
      secretEncrypted: 'pending',
    },
  });
  await db().webhook.update({
    where: { id: hook.id },
    data: { secretEncrypted: encryptSecret(secret, `webhook:${hook.id}`, encryptionKeyring()) },
  });
  await audit('webhooks.created', {
    actorId: actor.id,
    target: `webhook:${hook.id}`,
    meta: { events },
  });
  refresh();
  // The secret is shown once; afterwards only a rotation reveals a new one.
  return { ok: true, secret };
}

export async function setWebhookEnabled(id: string, enabled: boolean): Promise<WebhookResult> {
  const actor = await authorizeAction('settings.manage');
  if (!actor) return forbidden;
  if (!uuid.safeParse(id).success) return { ok: false, error: 'notFound' };
  const { count } = await db().webhook.updateMany({
    where: { id },
    data: { enabled: enabled === true },
  });
  if (count === 0) return { ok: false, error: 'notFound' };
  await audit('webhooks.updated', {
    actorId: actor.id,
    target: `webhook:${id}`,
    meta: { enabled },
  });
  refresh();
  return { ok: true };
}

export async function rotateWebhookSecret(id: string): Promise<WebhookResult> {
  const actor = await authorizeAction('settings.manage');
  if (!actor) return forbidden;
  if (!uuid.safeParse(id).success) return { ok: false, error: 'notFound' };
  const secret = newSecret();
  const { count } = await db().webhook.updateMany({
    where: { id },
    data: { secretEncrypted: encryptSecret(secret, `webhook:${id}`, encryptionKeyring()) },
  });
  if (count === 0) return { ok: false, error: 'notFound' };
  await audit('webhooks.secret_rotated', { actorId: actor.id, target: `webhook:${id}` });
  return { ok: true, secret };
}

export async function deleteWebhook(id: string): Promise<WebhookResult> {
  const actor = await authorizeAction('settings.manage');
  if (!actor) return forbidden;
  if (!uuid.safeParse(id).success) return { ok: false, error: 'notFound' };
  const { count } = await db().webhook.deleteMany({ where: { id } });
  if (count === 0) return { ok: false, error: 'notFound' };
  await audit('webhooks.deleted', { actorId: actor.id, target: `webhook:${id}` });
  refresh();
  return { ok: true };
}

export async function sendTestEvent(id: string): Promise<WebhookResult> {
  const actor = await authorizeAction('settings.manage');
  if (!actor) return forbidden;
  if (!uuid.safeParse(id).success) return { ok: false, error: 'notFound' };
  const sent = await emitWebhookEvent(
    { db: db(), redisUrl: getServerEnv().REDIS_URL, log: logger() },
    'ping',
    { message: 'Test event from RentAgent' },
    { webhookId: id },
  );
  if (sent === 0) return { ok: false, error: 'notFound' };
  refresh();
  return { ok: true };
}

/** Sends a failed delivery again (same id, so receivers can de-duplicate). */
export async function redeliver(deliveryId: string): Promise<WebhookResult> {
  const actor = await authorizeAction('settings.manage');
  if (!actor) return forbidden;
  if (!uuid.safeParse(deliveryId).success) return { ok: false, error: 'notFound' };
  const { count } = await db().webhookDelivery.updateMany({
    where: { id: deliveryId, status: 'FAILED' },
    data: { status: 'PENDING', attempts: 0, error: null },
  });
  if (count === 0) return { ok: false, error: 'notFound' };
  await enqueueWebhookDelivery(getServerEnv().REDIS_URL, deliveryId, Date.now());
  refresh();
  return { ok: true };
}
