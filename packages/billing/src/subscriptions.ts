import { Prisma, type PrismaClient, type SubscriptionStatus } from '@rentagent/db';
import { type StripeConnection, stripeClient } from './stripe';
import { applyEntry, lockWallet } from './wallet';

export interface PlanForStripe {
  id: string;
  name: string;
  description: string;
  priceMinor: bigint;
  currency: string;
  interval: 'MONTH' | 'YEAR';
  stripeProductId: string | null;
  stripePriceId: string | null;
}

/**
 * Creates or updates the plan's Stripe product and price. Stripe prices are
 * immutable: a changed amount or interval gets a new price (existing
 * subscribers keep theirs) and the old one is archived.
 */
export async function syncPlanToStripe(
  connection: StripeConnection,
  plan: PlanForStripe,
): Promise<{ productId: string; priceId: string }> {
  const stripe = stripeClient(connection);
  const productId = plan.stripeProductId
    ? (
        await stripe.products.update(plan.stripeProductId, {
          name: plan.name,
          description: plan.description || undefined,
        })
      ).id
    : (
        await stripe.products.create(
          {
            name: plan.name,
            description: plan.description || undefined,
            metadata: { planId: plan.id },
          },
          { idempotencyKey: `plan-product-${plan.id}` },
        )
      ).id;
  const interval = plan.interval === 'YEAR' ? 'year' : 'month';
  if (plan.stripePriceId) {
    const current = await stripe.prices.retrieve(plan.stripePriceId);
    if (
      current.unit_amount === Number(plan.priceMinor) &&
      current.currency === plan.currency.toLowerCase() &&
      current.recurring?.interval === interval
    )
      return { productId, priceId: current.id };
  }
  const price = await stripe.prices.create({
    product: productId,
    currency: plan.currency.toLowerCase(),
    unit_amount: Number(plan.priceMinor),
    recurring: { interval },
    metadata: { planId: plan.id },
  });
  if (plan.stripePriceId) await stripe.prices.update(plan.stripePriceId, { active: false });
  return { productId, priceId: price.id };
}

export async function createSubscriptionCheckout(
  connection: StripeConnection,
  input: {
    userId: string;
    email: string;
    planId: string;
    priceId: string;
    customerRef: string | null;
    successUrl: string;
    cancelUrl: string;
    automaticTax: boolean;
  },
): Promise<{ id: string; url: string }> {
  const metadata = { userId: input.userId, planId: input.planId };
  const session = await stripeClient(connection).checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: input.priceId, quantity: 1 }],
    client_reference_id: input.userId,
    ...(input.customerRef ? { customer: input.customerRef } : { customer_email: input.email }),
    metadata,
    // Copied onto every invoice (parent.subscription_details.metadata).
    subscription_data: { metadata },
    automatic_tax: { enabled: input.automaticTax },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    locale: 'auto',
  });
  if (!session.url) throw new Error('Stripe returned no checkout URL');
  return { id: session.id, url: session.url };
}

/** Stripe's hosted page where subscribers change plan, payment method or cancel. */
export async function createPortalSession(
  connection: StripeConnection,
  customerRef: string,
  returnUrl: string,
): Promise<string> {
  const session = await stripeClient(connection).billingPortal.sessions.create({
    customer: customerRef,
    return_url: returnUrl,
  });
  return session.url;
}

export async function cancelStripeSubscription(
  connection: StripeConnection,
  subscriptionRef: string,
): Promise<void> {
  await stripeClient(connection).subscriptions.cancel(subscriptionRef);
}

export function mapStripeStatus(status: string): SubscriptionStatus {
  if (status === 'active' || status === 'trialing') return 'ACTIVE';
  if (status === 'past_due' || status === 'unpaid') return 'PAST_DUE';
  if (status === 'canceled' || status === 'incomplete_expired') return 'CANCELED';
  return 'INCOMPLETE';
}

/** Keeps the local subscription row in line with Stripe (events may arrive in any order). */
export async function upsertSubscription(
  db: PrismaClient,
  data: {
    userId: string;
    planId: string | null;
    gatewayRef: string;
    customerRef: string;
    status?: SubscriptionStatus;
    currentPeriodEnd?: Date | null;
    cancelAtPeriodEnd?: boolean;
  },
): Promise<void> {
  if (!(await db.user.findUnique({ where: { id: data.userId }, select: { id: true } }))) return;
  const planId =
    data.planId && (await db.plan.findUnique({ where: { id: data.planId }, select: { id: true } }))
      ? data.planId
      : null;
  const fields = {
    customerRef: data.customerRef,
    ...(data.status ? { status: data.status } : {}),
    ...(data.currentPeriodEnd !== undefined ? { currentPeriodEnd: data.currentPeriodEnd } : {}),
    ...(data.cancelAtPeriodEnd !== undefined ? { cancelAtPeriodEnd: data.cancelAtPeriodEnd } : {}),
    ...(planId ? { planId } : {}),
  };
  await db.subscription.upsert({
    where: { gateway_gatewayRef: { gateway: 'STRIPE', gatewayRef: data.gatewayRef } },
    create: {
      userId: data.userId,
      gateway: 'STRIPE',
      gatewayRef: data.gatewayRef,
      planId,
      ...fields,
    },
    update: fields,
  });
}

/**
 * Records a paid subscription invoice and adds the plan's credits — once per
 * invoice (the unique gateway reference makes re-deliveries no-ops).
 */
export async function recordSubscriptionPayment(
  db: PrismaClient,
  data: {
    userId: string;
    invoiceRef: string;
    amountMinor: bigint;
    currency: string;
    creditsMinor: bigint;
    chargeRef: string | null;
    receiptUrl: string | null;
    planName: string;
  },
): Promise<'credited' | 'already' | 'unknown'> {
  if (!(await db.user.findUnique({ where: { id: data.userId }, select: { id: true } })))
    return 'unknown';
  try {
    return await db.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          userId: data.userId,
          gateway: 'STRIPE',
          gatewayRef: data.invoiceRef,
          chargeRef: data.chargeRef,
          amountMinor: data.amountMinor,
          currency: data.currency.toUpperCase(),
          status: 'SUCCEEDED',
          receiptUrl: data.receiptUrl,
        },
      });
      const wallet = await lockWallet(tx, data.userId, payment.currency);
      await applyEntry(tx, wallet, {
        type: 'TOPUP',
        availableDelta: data.creditsMinor,
        paymentId: payment.id,
        note: `plan:${data.planName}`.slice(0, 300),
      });
      return 'credited' as const;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      return 'already';
    throw error;
  }
}

/** Payment intent behind an invoice (for refund matching and receipts); best effort. */
export async function invoicePaymentIntent(
  connection: StripeConnection,
  invoiceRef: string,
): Promise<string | null> {
  try {
    const payments = await stripeClient(connection).invoicePayments.list({
      invoice: invoiceRef,
      limit: 1,
    });
    const intent = payments.data[0]?.payment.payment_intent;
    return typeof intent === 'string' ? intent : (intent?.id ?? null);
  } catch {
    return null;
  }
}
