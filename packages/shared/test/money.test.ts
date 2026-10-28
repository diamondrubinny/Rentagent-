import { describe, expect, it } from 'vitest';
import {
  currencyExponent,
  formatMoney,
  fromMinorUnits,
  isSupportedCurrency,
  toMinorUnits,
} from '../src/money';

describe('currency exponent', () => {
  it('uses ISO 4217 exponents', () => {
    expect(currencyExponent('USD')).toBe(2);
    expect(currencyExponent('ILS')).toBe(2);
    expect(currencyExponent('JPY')).toBe(0);
    expect(currencyExponent('KWD')).toBe(3);
  });
});

describe('toMinorUnits / fromMinorUnits', () => {
  it('round-trips amounts exactly', () => {
    expect(toMinorUnits('12.5', 'USD')).toBe(1250n);
    expect(toMinorUnits('1000', 'JPY')).toBe(1000n);
    expect(toMinorUnits('1.234', 'KWD')).toBe(1234n);
    expect(fromMinorUnits(1250n, 'USD')).toBe('12.50');
    expect(fromMinorUnits(5n, 'USD')).toBe('0.05');
    expect(fromMinorUnits(-5n, 'USD')).toBe('-0.05');
    expect(fromMinorUnits(1000n, 'JPY')).toBe('1000');
  });

  it('handles amounts beyond float precision', () => {
    expect(fromMinorUnits(toMinorUnits('90071992547409.93', 'USD'), 'USD')).toBe(
      '90071992547409.93',
    );
  });

  it('rejects excess precision and garbage', () => {
    expect(() => toMinorUnits('1.5', 'JPY')).toThrow(RangeError);
    expect(() => toMinorUnits('abc', 'USD')).toThrow(RangeError);
    expect(() => toMinorUnits('1e5', 'USD')).toThrow(RangeError);
  });
});

describe('formatMoney', () => {
  it('formats per locale', () => {
    expect(formatMoney(123456n, 'USD', 'en-US')).toBe('$1,234.56');
    expect(formatMoney(1000n, 'JPY', 'en-US')).toBe('¥1,000');
  });
});

describe('isSupportedCurrency', () => {
  it('validates codes', () => {
    expect(isSupportedCurrency('EUR')).toBe(true);
    expect(isSupportedCurrency('eur')).toBe(false);
    expect(isSupportedCurrency('XYZ1')).toBe(false);
  });
});
