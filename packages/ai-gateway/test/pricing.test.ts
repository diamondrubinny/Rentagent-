import { describe, expect, it } from 'vitest';
import { costMicros, decimalToScaled, formatMicros } from '../src/pricing';

describe('pricing', () => {
  it('parses decimals exactly', () => {
    expect(decimalToScaled('2.5', 6)).toBe(2_500_000n);
    expect(decimalToScaled('0.000150', 6)).toBe(150n);
    expect(decimalToScaled(null, 6)).toBe(0n);
    expect(() => decimalToScaled('-1', 6)).toThrow();
    expect(() => decimalToScaled('1e3', 6)).toThrow();
  });

  it('computes cost in micro-units and rounds up', () => {
    // $3 / 1M input, $15 / 1M output; 1000 in + 500 out = $0.003 + $0.0075 = $0.0105
    expect(costMicros({ inputTokens: 1000, outputTokens: 500 }, { input: '3', output: '15' })).toBe(
      10_500n,
    );
    // 1 token at $0.10/1M = 0.1 micro → rounds up to 1
    expect(costMicros({ inputTokens: 1, outputTokens: 0 }, { input: '0.1', output: '0' })).toBe(1n);
    expect(
      costMicros({ inputTokens: 100, outputTokens: 100 }, { input: null, output: undefined }),
    ).toBe(0n);
  });

  it('handles very large volumes without precision loss', () => {
    expect(
      costMicros({ inputTokens: 2_000_000_000, outputTokens: 0 }, { input: '1.234567', output: 0 }),
    ).toBe(2_469_134_000n);
  });

  it('formats micro-units', () => {
    expect(formatMicros(10_500n)).toBe('0.0105');
    expect(formatMicros(1_234_567_890n, 2)).toBe('1234.56');
  });
});
