import {
  applyRefundById,
  captureIdFromRefund,
  completePayment,
  toPayPalMinor,
  verifyPayPalWebhook,
} from '@rentagent/billing';
import { jsonResponse } from '@/lib/server/api-auth';
import { audit } from '@/lib/server/audit';
import { emitPaymentEvent, getBillingConfig } from '@/lib/server/billing';
import { db, logger } from '@/lib/server/runtime';

export const dynamic = 'force-dynamic';

const MAX_BODY = 512 * 1024;

interface PayPalEvent {
  event_type?: string;
  resource?: {
    id?: string;
    status?: string;
    amount?: { value: string; currency_code: string };
    supplementary_data?: { related_ids?: { order_id?: string; capture_id?: string } };
    links?: { rel: string; href: string }[];
  };
}

/** PayPal webhook: every delivery is verified with PayPal before it is used. */
export async function POST(request: Request) {
  const billing = await getBillingConfig();
  if (!billing.paypal?.webhookId) return jsonResponse(404, { error: 'not_configured' });
  const body = await request.text();
  if (body.length > MAX_BODY) return jsonResponse(400, { error: 'invalid' });
  let event: PayPalEvent;
  try {
    event = JSON.parse(body) as PayPalEvent;
  } catch {
    return jsonResponse(400, { error: 'invalid' });
  }
  if (
    !(await verifyPayPalWebhook(billing.paypal, billing.paypal.webhookId, request.headers, event))
  ) {
    logger().warn('paypal webhook failed verification');
    return jsonResponse(400, { error: 'invalid_signature' });
  }
  const resource = event.resource ?? {};
  if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
    const orderId = resource.supplementary_data?.related_ids?.order_id;
    if (orderId && resource.amount && resource.status === 'COMPLETED') {
      const result = await completePayment(db(), 'PAYPAL', orderId, {
        amountMinor: toPayPalMinor(resource.amount),
        currency: resource.amount.currency_code,
        chargeRef: resource.id ?? null,
      });
      if (result === 'credited') {
        await audit('billing.payment_succeeded', { meta: { gateway: 'paypal' } });
        const payment = await db().payment.findUnique({
          where: { gateway_gatewayRef: { gateway: 'PAYPAL', gatewayRef: orderId } },
        });
        if (payment) await emitPaymentEvent('payment.succeeded', payment);
      }
    }
  } else if (event.event_type === 'PAYMENT.CAPTURE.REFUNDED') {
    // The resource is the refund itself; its "up" link names the capture.
    const captureId = captureIdFromRefund(resource);
    if (captureId && resource.id && resource.amount) {
      const deducted = await applyRefundById(
        db(),
        'PAYPAL',
        captureId,
        resource.id,
        toPayPalMinor(resource.amount),
      );
      if (deducted > 0n) {
        await audit('billing.refund', {
          meta: { gateway: 'paypal', amountMinor: deducted.toString() },
        });
        const payment = await db().payment.findFirst({
          where: { gateway: 'PAYPAL', chargeRef: captureId },
        });
        if (payment) await emitPaymentEvent('payment.refunded', payment);
      }
    }
  }
  return jsonResponse(200, { received: true });
}
