import 'server-only';
import { getServerEnv } from '@rentagent/core';
import { emitWebhookEvent, type WebhookEvent, type WebhookPayloads } from '@rentagent/webhooks';
import { db, logger } from './runtime';

/** Notifies the operator's webhooks (queued; never throws). */
export function emitEvent<E extends WebhookEvent>(event: E, data: WebhookPayloads[E]) {
  return emitWebhookEvent(
    { db: db(), redisUrl: getServerEnv().REDIS_URL, log: logger() },
    event,
    data,
  );
}
