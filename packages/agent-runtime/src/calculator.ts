/**
 * Safe arithmetic evaluator for the calculator tool (no eval, no identifiers
 * beyond a fixed function list). Supports + - * / % ^, parentheses, unary minus,
 * decimals and sqrt/abs/round/floor/ceil/min/max/log/ln.
 */
const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  round: (value, digits = 0) => Number(value.toFixed(Math.max(0, Math.min(12, digits)))),
  floor: Math.floor,
  ceil: Math.ceil,
  min: Math.min,
  max: Math.max,
  log: Math.log10,
  ln: Math.log,
};

export class CalculatorError extends Error {}

export function evaluateExpression(source: string): number {
  if (source.length > 500) throw new CalculatorError('Expression too long');
  const tokens = source.match(/\d+(?:\.\d+)?(?:e[+-]?\d+)?|[a-z]+|[-+*/%^(),]|\S/gi) ?? [];
  let position = 0;
  let depth = 0;
  const peek = () => tokens[position];
  const next = () => tokens[position++];
  const expect = (token: string) => {
    if (next() !== token) throw new CalculatorError(`Expected "${token}"`);
  };

  function primary(): number {
    const token = next();
    if (token === undefined) throw new CalculatorError('Unexpected end');
    if (/^\d/.test(token)) return Number(token);
    if (token === '(') {
      if (++depth > 50) throw new CalculatorError('Too deeply nested');
      const value = expression();
      expect(')');
      depth--;
      return value;
    }
    const fn = FUNCTIONS[token.toLowerCase()];
    if (fn) {
      expect('(');
      const args = [expression()];
      while (peek() === ',') {
        next();
        args.push(expression());
      }
      expect(')');
      return fn(...args);
    }
    if (token.toLowerCase() === 'pi') return Math.PI;
    throw new CalculatorError(`Unexpected "${token}"`);
  }
  // Unary minus binds looser than ^, so -3^2 = -9 (mathematical convention).
  function unary(): number {
    if (peek() === '-') {
      next();
      return -unary();
    }
    if (peek() === '+') {
      next();
      return unary();
    }
    return power();
  }
  function power(): number {
    const base = primary();
    if (peek() === '^') {
      next();
      return base ** unary(); // right-associative, allows 2^-1
    }
    return base;
  }
  function term(): number {
    let value = unary();
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = next();
      const right = unary();
      value = op === '*' ? value * right : op === '/' ? value / right : value % right;
    }
    return value;
  }
  function expression(): number {
    let value = term();
    while (peek() === '+' || peek() === '-') {
      value = next() === '+' ? value + term() : value - term();
    }
    return value;
  }

  const result = expression();
  if (position !== tokens.length) throw new CalculatorError(`Unexpected "${peek()}"`);
  if (!Number.isFinite(result)) throw new CalculatorError('Result is not a finite number');
  return result;
}
