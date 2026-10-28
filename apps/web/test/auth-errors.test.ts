import { describe, expect, it } from 'vitest';
import { authErrorKey, safeNextPath } from '../src/lib/auth-errors';

describe('safeNextPath', () => {
  it('keeps same-origin relative paths', () => {
    expect(safeNextPath('/he/admin?tab=users#x')).toBe('/he/admin?tab=users#x');
  });

  it.each([
    'https://evil.example',
    '//evil.example/path',
    '/\\evil.example',
    'javascript:alert(1)',
    '',
    null,
    undefined,
    'relative/path',
  ])('rejects %s', (value) => {
    expect(safeNextPath(value as string | null | undefined, '/en')).toBe('/en');
  });
});

describe('authErrorKey', () => {
  it('maps known codes, rate limits and unknowns', () => {
    expect(authErrorKey({ code: 'INVALID_EMAIL_OR_PASSWORD' })).toBe('invalidCredentials');
    expect(authErrorKey({ status: 429 })).toBe('rateLimited');
    expect(authErrorKey({ code: 'SOMETHING_NEW' })).toBe('generic');
    expect(authErrorKey(null)).toBe('generic');
  });
});
