/** Events an operator can subscribe a webhook to. Payloads never contain chat content. */
export const WEBHOOK_EVENTS = [
  'user.registered',
  'run.succeeded',
  'run.failed',
  'payment.succeeded',
  'payment.refunded',
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const isWebhookEvent = (value: unknown): value is WebhookEvent =>
  typeof value === 'string' && (WEBHOOK_EVENTS as readonly string[]).includes(value);

export interface WebhookPayloads {
  'user.registered': { userId: string; email: string; name: string; locale: string | null };
  'run.succeeded': RunPayload;
  'run.failed': RunPayload & { errorKind: string | null };
  'payment.succeeded': PaymentPayload;
  'payment.refunded': PaymentPayload & { refundedMinor: string };
  /** Sent by "Send test event" in the admin. */
  ping: { message: string };
}

interface RunPayload {
  runId: string;
  agentSlug: string;
  userId: string | null;
  conversationId: string | null;
  chargedMinor: string;
  currency: string | null;
}

interface PaymentPayload {
  paymentId: string;
  userId: string | null;
  gateway: string;
  amountMinor: string;
  currency: string;
}
