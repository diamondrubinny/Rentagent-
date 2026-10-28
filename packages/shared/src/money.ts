/**
 * Money is always stored as an integer amount of the currency's minor unit
 * (ISO 4217 exponent). Never use floating point for amounts.
 */

/** ISO 4217 currencies whose minor-unit exponent is not 2. */
// prettier-ignore
const CURRENCY_EXPONENTS: Readonly<Record<string, number>> = {
  // 0 decimal places
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0, PYG: 0,
  RWF: 0, UGX: 0, UYI: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
  // 3 decimal places
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
  // 4 decimal places
  CLF: 4, UYW: 4,
};

let supportedCurrencies: Set<string> | undefined;

export function isSupportedCurrency(code: string): boolean {
  if (!/^[A-Z]{3}$/.test(code)) return false;
  supportedCurrencies ??= new Set(Intl.supportedValuesOf('currency'));
  return supportedCurrencies.has(code);
}

export function currencyExponent(currency: string): number {
  return CURRENCY_EXPONENTS[currency] ?? 2;
}

/**
 * Parses a decimal string (e.g. "12.5") into minor units for the currency.
 * Rejects values with more precision than the currency allows.
 */
export function toMinorUnits(decimal: string, currency: string): bigint {
  const exponent = currencyExponent(currency);
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(decimal.trim());
  if (!match) throw new RangeError(`Invalid decimal amount: ${decimal}`);
  const [, sign, whole = '0', fraction = ''] = match;
  if (fraction.length > exponent) {
    throw new RangeError(`${currency} allows at most ${exponent} decimal places`);
  }
  const minor = BigInt(whole + fraction.padEnd(exponent, '0'));
  return sign ? -minor : minor;
}

/** Converts minor units to an exact decimal string (no rounding). */
export function fromMinorUnits(minor: bigint, currency: string): string {
  const exponent = currencyExponent(currency);
  const negative = minor < 0n;
  const digits = (negative ? -minor : minor).toString().padStart(exponent + 1, '0');
  const whole = digits.slice(0, digits.length - exponent);
  const fraction = digits.slice(digits.length - exponent);
  return `${negative ? '-' : ''}${whole}${exponent > 0 ? `.${fraction}` : ''}`;
}

/** Formats minor units for display in the given UI locale. */
export function formatMoney(minor: bigint, currency: string, locale: string): string {
  const exponent = currencyExponent(currency);
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  });
  // Intl accepts decimal strings exactly, avoiding float precision loss on large amounts.
  return formatter.format(fromMinorUnits(minor, currency) as unknown as number);
}
