import { checkEndpointUrl } from '@rentagent/ai-gateway';
import { decryptSecret, type Keyring } from '@rentagent/core';
import type { PrismaClient } from '@rentagent/db';
import { signWebhook } from './sign';

export class WebhookDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookDeliveryError';
  }
}

const TIMEOUT_MS = 10_000;

/**
 * Sends one delivery. Success = any 2xx; redirects are not followed. Throws on
 * failure so the queue retries with backoff; the final attempt marks it FAILED.
 */
export async function deliverWebhook(
  deps: { db: PrismaClient; keyring: Keyring; userAgent: string },
  deliveryId: string,
  { finalAttempt }: { finalAttempt: boolean },
): Promise<'sent' | 'skipped'> {
  const { db } = deps;
  const delivery = await db.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { webhook: true },
  });
  if (!delivery || delivery.status === 'SUCCEEDED') return 'skipped';
  const fail = async (error: string, responseStatus?: number) => {
    await db.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        attempts: { increment: 1 },
        responseStatus: responseStatus ?? null,
        error: error.slice(0, 200),
        status: finalAttempt ? 'FAILED' : 'PENDING',
      },
    });
    throw new WebhookDeliveryError(error);
  };
  if (!delivery.webhook.enabled && delivery.event !== 'ping') {
    await db.webhookDelivery.update({
      where: { id: deliveryId },
      data: { status: 'FAILED', error: 'webhook disabled' },
    });
    return 'skipped';
  }
  // Checked again at delivery time: DNS may have changed since the URL was saved.
  const check = await checkEndpointUrl(delivery.webhook.url);
  if (!check.ok) return fail(`destination ${check.reason}`);

  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({
    id: delivery.id,
    event: delivery.event,
    createdAt: delivery.createdAt.toISOString(),
    data: delivery.payload,
  });
  const secret = decryptSecret(
    delivery.webhook.secretEncrypted,
    `webhook:${delivery.webhook.id}`,
    deps.keyring,
  );
  let response: Response;
  try {
    response = await fetch(delivery.webhook.url, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'content-type': 'application/json',
        'user-agent': deps.userAgent,
        'x-rentagent-event': delivery.event,
        'x-rentagent-delivery': delivery.id,
        'x-rentagent-signature': signWebhook(secret, body, timestamp),
      },
      body,
    });
    await response.body?.cancel().catch(() => undefined);
  } catch (error) {
    return fail(
      error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network error',
    );
  }
  if (response.status < 200 || response.status >= 300)
    return fail(`HTTP ${response.status}`, response.status);
  await db.webhookDelivery.update({
    where: { id: deliveryId },
    data: {
      status: 'SUCCEEDED',
      attempts: { increment: 1 },
      responseStatus: response.status,
      error: null,
      deliveredAt: new Date(),
    },
  });
  return 'sent';
}
