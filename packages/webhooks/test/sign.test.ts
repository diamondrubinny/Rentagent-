import { describe, expect, it } from 'vitest';
import { isWebhookEvent } from '../src/events';
import { signWebhook, verifyWebhookSignature } from '../src/sign';

describe('webhook signatures', () => {
  const secret = 'secret-value';
  const body = '{"event":"run.succeeded"}';
  it('round-trips and rejects tampering, wrong secrets and old timestamps', () => {
    const now = 1_800_000_000;
    const header = signWebhook(secret, body, now);
    expect(header).toMatch(/^t=1800000000,v1=[0-9a-f]{64}$/);
    expect(verifyWebhookSignature(secret, body, header, now)).toBe(true);
    expect(verifyWebhookSignature(secret, body.replace('succeeded', 'failed'), header, now)).toBe(
      false,
    );
    expect(verifyWebhookSignature('other', body, header, now)).toBe(false);
    expect(verifyWebhookSignature(secret, body, header, now + 301)).toBe(false);
    expect(verifyWebhookSignature(secret, body, 'garbage', now)).toBe(false);
  });
  it('knows its events', () => {
    expect(isWebhookEvent('payment.succeeded')).toBe(true);
    expect(isWebhookEvent('user.deleted')).toBe(false);
  });
});
