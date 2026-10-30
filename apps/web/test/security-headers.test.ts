import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy, EMBED_PATH, generateNonce } from '../src/lib/security-headers';

describe('buildContentSecurityPolicy', () => {
  it('uses a nonce and blocks framing and plugins in production', () => {
    const csp = buildContentSecurityPolicy('abc123', false);
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain('upgrade-insecure-requests');
    expect(csp).not.toContain('unsafe-eval');
  });

  it('allows eval and websockets only in development', () => {
    const csp = buildContentSecurityPolicy('abc123', true);
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain('ws:');
    expect(csp).not.toContain('upgrade-insecure-requests');
  });
});

describe('frame-ancestors for the widget', () => {
  it('lists allowed origins and drops anything that is not an origin', () => {
    const csp = buildContentSecurityPolicy('n', false, [
      'https://shop.example.com',
      'http://localhost:4020',
      'https://evil.example; script-src *',
      'javascript:alert(1)',
    ]);
    expect(csp).toContain('frame-ancestors https://shop.example.com http://localhost:4020;');
    expect(csp).not.toContain('evil');
  });

  it('matches only the embed path', () => {
    expect(EMBED_PATH.exec('/he/embed/0123456789abcdef01234567')?.[1]).toBe(
      '0123456789abcdef01234567',
    );
    expect(EMBED_PATH.test('/en/embed/../admin')).toBe(false);
    expect(EMBED_PATH.test('/en/admin/embed/0123456789abcdef01234567')).toBe(false);
  });
});

describe('generateNonce', () => {
  it('returns unique base64 values', () => {
    const a = generateNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(a).not.toBe(generateNonce());
  });
});
