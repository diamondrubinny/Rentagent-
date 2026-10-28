import { describe, expect, it } from 'vitest';
import { CalculatorError, evaluateExpression } from '../src/calculator';

describe('evaluateExpression', () => {
  it.each([
    ['2+3*4', 14],
    ['(2+3)*4', 20],
    ['-3^2', -9],
    ['2^3^2', 512],
    ['10 % 3', 1],
    ['sqrt(16) + abs(-2)', 6],
    ['round(3.14159, 2)', 3.14],
    ['max(1, 7, 3)', 7],
    ['1.5e3 / 3', 500],
    ['2*pi', 2 * Math.PI],
    ['2^-1', 0.5],
    ['--4', 4],
    ['3*-2', -6],
  ])('%s = %d', (expression, expected) => {
    expect(evaluateExpression(expression)).toBeCloseTo(expected);
  });

  it.each(['process.exit(1)', 'constructor', '1 +', '(1+2', '1/0', 'alert(1)', '1;2', '[1]'])(
    'rejects %s',
    (expression) => {
      expect(() => evaluateExpression(expression)).toThrow(CalculatorError);
    },
  );

  it('limits nesting and length', () => {
    expect(() => evaluateExpression('('.repeat(60) + '1' + ')'.repeat(60))).toThrow(
      CalculatorError,
    );
    expect(() => evaluateExpression('1+'.repeat(300) + '1')).toThrow(CalculatorError);
  });
});
