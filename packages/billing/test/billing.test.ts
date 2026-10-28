import Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import { decimalToMicros, decimalToMinor, microsToMinorCeil, minorToMicros } from '../src/amounts';
import { verifyStripeEvent } from '../src/stripe';
import { captureAmount, planHold } from '../src/wallet';

describe('amounts', () => {
  it('converts decimals and rounds prices up to the currency precision', () => {
    expect(decimalToMicros('1.25')).toBe(1_250_000n);
    expect(decimalToMicros('0.000001')).toBe(1n);
    expect(() => decimalToMicros('1.2345678')).toThrow();
    expect(() => decimalToMicros('-1')).toThrow();
    expect(microsToMinorCeil(1n, 'EUR')).toBe(1n);
    expect(microsToMinorCeil(10_000n, 'EUR')).toBe(1n);
    expect(microsToMinorCeil(10_001n, 'EUR')).toBe(2n);
    expect(microsToMinorCeil(0n, 'EUR')).toBe(0n);
    expect(microsToMinorCeil(1_500_000n, 'JPY')).toBe(2n);
    expect(microsToMinorCeil(1_000_001n, 'KWD')).toBe(1001n);
    expect(decimalToMinor('12.5', 'USD')).toBe(1250n);
    expect(minorToMicros(150n, 'EUR')).toBe(1_500_000n);
  });
});

describe('planHold', () => {
  const toMicros = (minor: bigint) => minorToMicros(minor, 'EUR');
  it('reserves the cap or what is left for usage pricing', () => {
    const usage = { mode: 'usage' as const, perTaskMinor: 0n, maxPerTaskMinor: 100n };
    expect(planHold(usage, 500n, toMicros)).toEqual({
      holdMinor: 100n,
      priceLimitMicros: 1_000_000n,
    });
    expect(planHold(usage, 40n, toMicros)).toEqual({ holdMinor: 40n, priceLimitMicros: 400_000n });
    expect(planHold(usage, 0n, toMicros)).toBeNull();
    expect(planHold(usage, -5n, toMicros)).toBeNull();
  });
  it('needs the full fixed price and nothing for free agents', () => {
    const fixed = { mode: 'per_task' as const, perTaskMinor: 250n, maxPerTaskMinor: 0n };
    expect(planHold(fixed, 250n, toMicros)).toEqual({ holdMinor: 250n, priceLimitMicros: null });
    expect(planHold(fixed, 249n, toMicros)).toBeNull();
    expect(planHold({ mode: 'free', perTaskMinor: 0n, maxPerTaskMinor: 0n }, 0n, toMicros)).toEqual(
      {
        holdMinor: 0n,
        priceLimitMicros: null,
      },
    );
  });
});

describe('captureAmount', () => {
  it('charges usage up to the hold, rounded up', () => {
    const base = { holdMinor: 100n, status: 'SUCCEEDED', fixedPrice: false };
    expect(captureAmount({ ...base, priceMicros: 123_456n }, 'EUR')).toBe(13n);
    expect(captureAmount({ ...base, priceMicros: 5_000_000n }, 'EUR')).toBe(100n);
    expect(captureAmount({ ...base, priceMicros: 0n, status: 'FAILED' }, 'EUR')).toBe(0n);
    // A failed run still pays for the tokens it used (usage pricing).
    expect(captureAmount({ ...base, priceMicros: 20_000n, status: 'FAILED' }, 'EUR')).toBe(2n);
  });
  it('charges fixed prices only on success', () => {
    const fixed = { holdMinor: 250n, priceMicros: 999n, fixedPrice: true };
    expect(captureAmount({ ...fixed, status: 'SUCCEEDED' }, 'EUR')).toBe(250n);
    expect(captureAmount({ ...fixed, status: 'FAILED' }, 'EUR')).toBe(0n);
    expect(captureAmount({ ...fixed, status: 'CANCELED' }, 'EUR')).toBe(0n);
  });
});

describe('verifyStripeEvent', () => {
  const secret = 'whsec_test_secret';
  const payload = JSON.stringify({
    id: 'evt_1',
    object: 'event',
    type: 'checkout.session.completed',
    data: { object: {} },
  });
  it('accepts a correctly signed payload and rejects tampering', () => {
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect(verifyStripeEvent(payload, header, secret).id).toBe('evt_1');
    expect(() => verifyStripeEvent(payload.replace('evt_1', 'evt_2'), header, secret)).toThrow();
    expect(() => verifyStripeEvent(payload, header, 'whsec_other')).toThrow();
  });
});
