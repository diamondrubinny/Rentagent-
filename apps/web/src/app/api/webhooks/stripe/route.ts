import {
  invoicePaymentIntent,
  mapStripeStatus,
  recordSubscriptionPayment,
  upsertSubscription,
  applyRefund,
  completePayment,
  stripeReceiptUrl,
  verifyStripeEvent,
} from '@rentagent/billing';
import { jsonResponse } from '@/lib/server/api-auth';
import { audit } from '@/lib/server/audit';
import { emitPaymentEvent, getBillingConfig } from '@/lib/server/billing';
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
      if (session.mode === 'subscription') {
        // The subscription row; credits come with invoice.paid.
        const subscription =
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id;
        const customer =
          typeof session.customer === 'string' ? session.customer : session.customer?.id;
        const userId = session.metadata?.userId;
        if (subscription && customer && userId)
          await upsertSubscription(db(), {
            userId,
            planId: session.metadata?.planId ?? null,
            gatewayRef: subscription,
            customerRef: customer,
          });
        break;
      }
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
        if (payment) await emitPaymentEvent('payment.succeeded', payment);
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
        if (deducted > 0n) {
          const payment = await db().payment.findFirst({
            where: { gateway: 'STRIPE', chargeRef: intent },
          });
          if (payment) await emitPaymentEvent('payment.refunded', payment);
        }
        if (deducted > 0n)
          await audit('billing.refund', {
            meta: { gateway: 'stripe', amountMinor: deducted.toString() },
          });
      }
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const userId = subscription.metadata?.userId;
      const customer =
        typeof subscription.customer === 'string'
          ? subscription.customer
          : subscription.customer.id;
      const periodEnd = subscription.items.data[0]?.current_period_end;
      if (userId)
        await upsertSubscription(db(), {
          userId,
          planId: subscription.metadata?.planId ?? null,
          gatewayRef: subscription.id,
          customerRef: customer,
          status:
            event.type === 'customer.subscription.deleted'
              ? 'CANCELED'
              : mapStripeStatus(subscription.status),
          currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
        });
      break;
    }
    case 'invoice.paid': {
      const invoice = event.data.object;
      const details = invoice.parent?.subscription_details;
      const userId = details?.metadata?.userId;
      const planId = details?.metadata?.planId;
      if (!details || !userId || !planId || invoice.amount_paid <= 0) break;
      const plan = await db().plan.findUnique({ where: { id: planId } });
      if (!plan) {
        logger().error({ invoice: invoice.id }, 'paid invoice for an unknown plan');
        break;
      }
      const intent = await invoicePaymentIntent(billing.stripe, invoice.id);
      const result = await recordSubscriptionPayment(db(), {
        userId,
        invoiceRef: invoice.id,
        amountMinor: BigInt(invoice.amount_paid),
        currency: invoice.currency,
        creditsMinor: plan.creditsMinor,
        chargeRef: intent,
        receiptUrl: invoice.hosted_invoice_url ?? null,
        planName: plan.name,
      });
      if (result === 'credited') {
        const payment = await db().payment.findUnique({
          where: { gateway_gatewayRef: { gateway: 'STRIPE', gatewayRef: invoice.id } },
        });
        await audit('billing.subscription_paid', {
          actorId: userId,
          target: `payment:${payment?.id}`,
          meta: { plan: plan.id },
        });
        if (payment) await emitPaymentEvent('payment.succeeded', payment);
      }
      break;
    }
    default:
      break;
  }
  return jsonResponse(200, { received: true });
}
