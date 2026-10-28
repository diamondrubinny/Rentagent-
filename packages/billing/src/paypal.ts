import { fromMinorUnits, toMinorUnits } from '@rentagent/shared';

export interface PayPalConnection {
  mode: 'sandbox' | 'live';
  clientId: string;
  clientSecret: string;
}

/** PAYPAL_API_BASE points at a local mock in automated tests. */
function apiBase(mode: PayPalConnection['mode']): string {
  if (process.env.PAYPAL_API_BASE) return process.env.PAYPAL_API_BASE.replace(/\/$/, '');
  return mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}

export class PayPalError extends Error {
  constructor(
    readonly status: number,
    readonly issue: string,
  ) {
    super(`PayPal error ${status}: ${issue}`);
    this.name = 'PayPalError';
  }
}

async function call<T>(
  connection: PayPalConnection,
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown; requestId?: string },
): Promise<T> {
  const token = await accessToken(connection);
  const response = await fetch(`${apiBase(connection.mode)}${path}`, {
    method: init.method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      // Same request id = same result on retries (PayPal idempotency).
      ...(init.requestId ? { 'paypal-request-id': init.requestId } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  if (!response.ok) {
    let issue = 'unknown';
    try {
      const data = JSON.parse(text) as { name?: string; details?: { issue?: string }[] };
      issue = data.details?.[0]?.issue ?? data.name ?? issue;
    } catch {
      // keep "unknown": never surface raw bodies
    }
    throw new PayPalError(response.status, issue);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

const tokens = new Map<string, { token: string; expires: number }>();

async function accessToken(connection: PayPalConnection): Promise<string> {
  const key = `${connection.mode}:${connection.clientId}`;
  const cached = tokens.get(key);
  if (cached && cached.expires > Date.now()) return cached.token;
  const response = await fetch(`${apiBase(connection.mode)}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${connection.clientId}:${connection.clientSecret}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new PayPalError(response.status, 'authentication_failed');
  const data = (await response.json()) as { access_token: string; expires_in: number };
  tokens.set(key, {
    token: data.access_token,
    expires: Date.now() + Math.max(60, data.expires_in - 120) * 1000,
  });
  return data.access_token;
}

export async function createPayPalOrder(
  connection: PayPalConnection,
  input: {
    paymentId: string;
    amountMinor: bigint;
    currency: string;
    description: string;
    brandName: string;
    returnUrl: string;
    cancelUrl: string;
  },
): Promise<{ id: string; approveUrl: string }> {
  const order = await call<{ id: string; links?: { rel: string; href: string }[] }>(
    connection,
    '/v2/checkout/orders',
    {
      method: 'POST',
      requestId: `order-${input.paymentId}`,
      body: {
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: input.paymentId,
            custom_id: input.paymentId,
            description: input.description.slice(0, 127),
            amount: {
              currency_code: input.currency,
              value: fromMinorUnits(input.amountMinor, input.currency),
            },
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              brand_name: input.brandName.slice(0, 127),
              user_action: 'PAY_NOW',
              shipping_preference: 'NO_SHIPPING',
              return_url: input.returnUrl,
              cancel_url: input.cancelUrl,
            },
          },
        },
      },
    },
  );
  const approve = order.links?.find(
    (link) => link.rel === 'payer-action' || link.rel === 'approve',
  );
  if (!approve) throw new PayPalError(502, 'no_approval_link');
  return { id: order.id, approveUrl: approve.href };
}

export interface PayPalCapture {
  status: string;
  captureId: string | null;
  amountMinor: bigint;
  currency: string;
}

/** Captures an approved order (idempotent on PayPal's side via the request id). */
export async function capturePayPalOrder(
  connection: PayPalConnection,
  orderId: string,
): Promise<PayPalCapture> {
  const order = await call<{
    status: string;
    purchase_units?: {
      payments?: {
        captures?: {
          id: string;
          status: string;
          amount: { currency_code: string; value: string };
        }[];
      };
    }[];
  }>(connection, `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: 'POST',
    requestId: `capture-${orderId}`,
    body: {},
  });
  const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
  return {
    status: capture?.status ?? order.status,
    captureId: capture?.id ?? null,
    amountMinor: capture ? toMinorUnits(capture.amount.value, capture.amount.currency_code) : 0n,
    currency: capture?.amount.currency_code ?? '',
  };
}

/** Asks PayPal whether a webhook delivery is authentic. */
export async function verifyPayPalWebhook(
  connection: PayPalConnection,
  webhookId: string,
  headers: Headers,
  event: unknown,
): Promise<boolean> {
  const header = (name: string) => headers.get(name) ?? '';
  try {
    const result = await call<{ verification_status: string }>(
      connection,
      '/v1/notifications/verify-webhook-signature',
      {
        method: 'POST',
        body: {
          auth_algo: header('paypal-auth-algo'),
          cert_url: header('paypal-cert-url'),
          transmission_id: header('paypal-transmission-id'),
          transmission_sig: header('paypal-transmission-sig'),
          transmission_time: header('paypal-transmission-time'),
          webhook_id: webhookId,
          webhook_event: event,
        },
      },
    );
    return result.verification_status === 'SUCCESS';
  } catch {
    return false;
  }
}

/** PayPal amount object -> minor units. */
export function toPayPalMinor(amount: { value: string; currency_code: string }): bigint {
  return toMinorUnits(amount.value, amount.currency_code);
}

/** Capture id from a refund's "up" link (…/v2/payments/captures/{id}). */
export function captureIdFromRefund(refund: {
  links?: { rel: string; href: string }[];
}): string | null {
  const up = refund.links?.find((link) => link.rel === 'up')?.href;
  const match = up ? /\/captures\/([^/?#]+)/.exec(up) : null;
  return match ? decodeURIComponent(match[1]!) : null;
}

export async function testPayPal(connection: PayPalConnection): Promise<boolean> {
  try {
    await accessToken(connection);
    return true;
  } catch {
    return false;
  }
}
