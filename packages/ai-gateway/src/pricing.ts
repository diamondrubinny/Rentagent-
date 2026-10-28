/** Parses a non-negative decimal string (e.g. "2.5", "0.000150") into an integer scaled by 10^scale. */
export function decimalToScaled(value: string | number | null | undefined, scale: number): bigint {
  if (value === null || value === undefined || value === '') return 0n;
  const text = typeof value === 'number' ? value.toFixed(scale) : value.trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) throw new RangeError(`Invalid decimal: ${text}`);
  const fraction = (match[2] ?? '').slice(0, scale).padEnd(scale, '0');
  return BigInt(match[1] + fraction);
}

/**
 * Cost of a call in micro-units (10^-6) of the price currency, rounded up so the
 * operator never under-charges. Prices are per 1M tokens.
 */
export function costMicros(
  usage: { inputTokens: number; outputTokens: number },
  pricePer1M: {
    input: string | number | null | undefined;
    output: string | number | null | undefined;
  },
): bigint {
  // price per 1M tokens in micro-units == price per token in pico-units; divide by 1e6 at the end.
  const input = decimalToScaled(pricePer1M.input, 6) * BigInt(Math.max(0, usage.inputTokens));
  const output = decimalToScaled(pricePer1M.output, 6) * BigInt(Math.max(0, usage.outputTokens));
  const total = input + output;
  return total === 0n ? 0n : (total + 999_999n) / 1_000_000n;
}

/** Formats micro-units as a decimal string with `digits` fraction digits (truncating). */
export function formatMicros(micros: bigint, digits = 4): string {
  const negative = micros < 0n;
  const abs = negative ? -micros : micros;
  const whole = abs / 1_000_000n;
  const fraction = (abs % 1_000_000n).toString().padStart(6, '0').slice(0, digits);
  return `${negative ? '-' : ''}${whole}${digits > 0 ? `.${fraction}` : ''}`;
}
