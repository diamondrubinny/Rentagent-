import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy, generateNonce } from '../src/lib/security-headers';

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

describe('generateNonce', () => {
  it('returns unique base64 values', () => {
    const a = generateNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(a).not.toBe(generateNonce());
  });
});
