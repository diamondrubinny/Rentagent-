import { currencyExponent } from '@rentagent/shared';

const MICROS = 1_000_000n;

/** "1.25" -> 1_250_000n micro-units (at most 6 decimals; throws otherwise). */
export function decimalToMicros(decimal: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(decimal.trim());
  if (!match) throw new RangeError(`Invalid decimal amount: ${decimal}`);
  return BigInt(match[1]!) * MICROS + BigInt((match[2] ?? '').padEnd(6, '0'));
}

/** Micro-units -> minor units of the currency, rounded up (users are never undercharged by rounding). */
export function microsToMinorCeil(micros: bigint, currency: string): bigint {
  if (micros <= 0n) return 0n;
  const factor = MICROS / 10n ** BigInt(currencyExponent(currency));
  return (micros + factor - 1n) / factor;
}

/** Minor units -> micro-units (exact). */
export function minorToMicros(minor: bigint, currency: string): bigint {
  return minor * (MICROS / 10n ** BigInt(currencyExponent(currency)));
}

/** "10.5" -> minor units, rounded up to the currency's precision. */
export function decimalToMinor(decimal: string, currency: string): bigint {
  return microsToMinorCeil(decimalToMicros(decimal), currency);
}
