import { enqueueWebhookDelivery } from '@rentagent/core';
import type { PrismaClient } from '@rentagent/db';
import type { WebhookEvent, WebhookPayloads } from './events';

interface Logger {
  error(obj: object, msg?: string): void;
}

/**
 * Records one delivery per subscribed, enabled webhook and queues it. Never
 * throws: a failing notification must not break the action that caused it.
 */
export async function emitWebhookEvent<E extends WebhookEvent | 'ping'>(
  deps: { db: PrismaClient; redisUrl: string; log: Logger },
  event: E,
  data: WebhookPayloads[E],
  only?: { webhookId: string },
): Promise<number> {
  try {
    const hooks = await deps.db.webhook.findMany({
      where: only ? { id: only.webhookId } : { enabled: true, events: { has: event } },
      select: { id: true },
    });
    for (const hook of hooks) {
      const delivery = await deps.db.webhookDelivery.create({
        data: { webhookId: hook.id, event, payload: data as object },
      });
      await enqueueWebhookDelivery(deps.redisUrl, delivery.id);
    }
    return hooks.length;
  } catch (error) {
    deps.log.error(
      { event, err: error instanceof Error ? error.message : String(error) },
      'failed to queue webhook event',
    );
    return 0;
  }
}
