import {
  applyRefund,
  completePayment,
  stripeReceiptUrl,
  verifyStripeEvent,
} from '@rentagent/billing';
import { jsonResponse } from '@/lib/server/api-auth';
import { audit } from '@/lib/server/audit';
import { getBillingConfig } from '@/lib/server/billing';
import { db, logger } from '@/lib/server/runtime';

export const dynamic = 'force-dynamic';

const MAX_BODY = 512 * 1024;

/**
 * Stripe webhook. Only signed events are processed; handlers are idempotent
 * because Stripe retries deliveries and may send them out of order.
 */
export async function POST(request: Request) {
  const billing = await getBillingConfig();
  if (!billing.stripe?.webhookSecret) return jsonResponse(404, { error: 'not_configured' });
  const signature = request.headers.get('stripe-signature');
  const length = Number(request.headers.get('content-length') ?? 0);
  if (!signature || length > MAX_BODY) return jsonResponse(400, { error: 'invalid' });
  const body = await request.text();
  if (body.length > MAX_BODY) return jsonResponse(400, { error: 'invalid' });

  let event;
  try {
    event = verifyStripeEvent(body, signature, billing.stripe.webhookSecret);
  } catch {
    logger().warn('stripe webhook with invalid signature');
    return jsonResponse(400, { error: 'invalid_signature' });
  }

  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object;
      if (session.payment_status !== 'paid' || session.mode !== 'payment') break;
      const paymentIntent =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : (session.payment_intent?.id ?? null);
      const result = await completePayment(db(), 'STRIPE', session.id, {
        // Credits equal the net amount; tax (Stripe Tax) is recorded separately.
        amountMinor: BigInt(session.amount_subtotal ?? -1),
        currency: (session.currency ?? '').toUpperCase(),
        chargeRef: paymentIntent,
        taxMinor: BigInt(session.total_details?.amount_tax ?? 0),
        receiptUrl: paymentIntent ? await stripeReceiptUrl(billing.stripe, paymentIntent) : null,
      });
      if (result === 'credited') {
        const payment = await db().payment.findUnique({
          where: { gateway_gatewayRef: { gateway: 'STRIPE', gatewayRef: session.id } },
        });
        await audit('billing.payment_succeeded', {
          actorId: payment?.userId ?? undefined,
          target: `payment:${payment?.id}`,
          meta: { gateway: 'stripe' },
        });
      } else if (result === 'mismatch') {
        logger().error({ session: session.id }, 'stripe payment amount does not match the top-up');
      }
      break;
    }
    case 'checkout.session.async_payment_failed':
    case 'checkout.session.expired': {
      await db().payment.updateMany({
        where: { gateway: 'STRIPE', gatewayRef: event.data.object.id, status: 'PENDING' },
        data: { status: 'FAILED' },
      });
      break;
    }
    case 'charge.refunded': {
      const charge = event.data.object;
      const intent =
        typeof charge.payment_intent === 'string'
          ? charge.payment_intent
          : charge.payment_intent?.id;
      if (intent) {
        const deducted = await applyRefund(db(), 'STRIPE', intent, BigInt(charge.amount_refunded));
        if (deducted > 0n)
          await audit('billing.refund', {
            meta: { gateway: 'stripe', amountMinor: deducted.toString() },
          });
      }
      break;
    }
    default:
      break;
  }
  return jsonResponse(200, { received: true });
}
