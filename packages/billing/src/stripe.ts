import Stripe from 'stripe';

export interface StripeConnection {
  secretKey: string;
}

/**
 * Stripe client. STRIPE_API_BASE (e.g. http://127.0.0.1:4012) points the SDK at
 * a local mock for automated tests; production uses Stripe's default host.
 */
export function stripeClient({ secretKey }: StripeConnection): Stripe {
  const base = process.env.STRIPE_API_BASE ? new URL(process.env.STRIPE_API_BASE) : null;
  return new Stripe(secretKey, {
    maxNetworkRetries: 2,
    timeout: 20_000,
    telemetry: false,
    ...(base
      ? {
          host: base.hostname,
          port: base.port || (base.protocol === 'https:' ? 443 : 80),
          protocol: base.protocol === 'https:' ? 'https' : 'http',
        }
      : {}),
  });
}

export async function createStripeCheckout(
  connection: StripeConnection,
  input: {
    paymentId: string;
    userId: string;
    email: string;
    amountMinor: bigint;
    currency: string;
    productName: string;
    successUrl: string;
    cancelUrl: string;
    automaticTax: boolean;
  },
): Promise<{ id: string; url: string }> {
  const session = await stripeClient(connection).checkout.sessions.create(
    {
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: input.currency.toLowerCase(),
            unit_amount: Number(input.amountMinor),
            product_data: { name: input.productName },
          },
        },
      ],
      client_reference_id: input.paymentId,
      customer_email: input.email,
      metadata: { paymentId: input.paymentId, userId: input.userId },
      payment_intent_data: { metadata: { paymentId: input.paymentId } },
      automatic_tax: { enabled: input.automaticTax },
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      // Stripe shows the checkout page in the payer's browser language.
      locale: 'auto',
    },
    // Retries of the same top-up never create two sessions.
    { idempotencyKey: `checkout-${input.paymentId}` },
  );
  if (!session.url) throw new Error('Stripe returned no checkout URL');
  return { id: session.id, url: session.url };
}

/** Verifies the Stripe-Signature header against the raw body; throws when invalid. */
export function verifyStripeEvent(rawBody: string, signature: string, webhookSecret: string) {
  return Stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}

/** Receipt link of the payment's charge (best effort). */
export async function stripeReceiptUrl(
  connection: StripeConnection,
  paymentIntentId: string,
): Promise<string | null> {
  try {
    const intent = await stripeClient(connection).paymentIntents.retrieve(paymentIntentId, {
      expand: ['latest_charge'],
    });
    const charge = intent.latest_charge;
    return charge && typeof charge === 'object' ? (charge.receipt_url ?? null) : null;
  } catch {
    return null;
  }
}

/** Checks that the key works (used by the admin "test connection"). */
export async function testStripe(connection: StripeConnection): Promise<boolean> {
  try {
    await stripeClient(connection).balance.retrieve();
    return true;
  } catch {
    return false;
  }
}
