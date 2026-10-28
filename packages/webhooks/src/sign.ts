import { createHmac, timingSafeEqual } from 'node:crypto';

/** Header value: "t=<unix seconds>,v1=<hex HMAC-SHA256 of `${t}.${body}`>". */
export function signWebhook(secret: string, body: string, timestamp: number): string {
  const digest = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

/**
 * Reference verification for receivers (documented for operators): checks the
 * signature in constant time and rejects timestamps older than `toleranceSeconds`.
 */
export function verifyWebhookSignature(
  secret: string,
  body: string,
  header: string,
  now = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300,
): boolean {
  const parts = Object.fromEntries(
    header.split(',').map((part) => part.trim().split('=') as [string, string]),
  );
  const timestamp = Number(parts.t);
  if (!Number.isInteger(timestamp) || Math.abs(now - timestamp) > toleranceSeconds) return false;
  const expected = Buffer.from(signWebhook(secret, body, timestamp).split('v1=')[1]!, 'hex');
  const given = Buffer.from(parts.v1 ?? '', 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
