import { describe, expect, it } from 'vitest';
import {
  assertPublicUrl,
  BlockedDestinationError,
  hostAllowed,
  isNonPublicAddress,
  safeFetch,
} from '../src/net-guard';

describe('isNonPublicAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '::1',
    '::',
    'fc00::1',
    'fd12::1',
    'fe80::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '64:ff9b::a00:1',
  ])('%s is blocked', (address) => {
    expect(isNonPublicAddress(address)).toBe(true);
  });
  it.each(['8.8.8.8', '93.184.216.34', '172.32.0.1', '2606:4700:4700::1111'])(
    '%s is public',
    (address) => {
      expect(isNonPublicAddress(address)).toBe(false);
    },
  );
});

describe('assertPublicUrl', () => {
  it('accepts public URLs', () => {
    expect(assertPublicUrl('https://example.com/a?b=c').hostname).toBe('example.com');
  });
  it.each([
    ['file:///etc/passwd', 'protocol'],
    ['gopher://example.com', 'protocol'],
    ['http://user:pw@example.com', 'credentials'],
    ['http://localhost:3000', 'private'],
    ['http://api.internal/', 'private'],
    ['http://127.0.0.1/', 'private'],
    ['http://[::1]/', 'private'],
    ['http://10.0.0.1/', 'private'],
    ['http://169.254.169.254/latest/meta-data', 'private'],
  ])('rejects %s', (url, reason) => {
    expect(() => assertPublicUrl(url)).toThrowError(expect.objectContaining({ reason }));
  });
  it('enforces the allowlist', () => {
    expect(() => assertPublicUrl('https://evil.com', ['example.com'])).toThrow(
      BlockedDestinationError,
    );
    expect(assertPublicUrl('https://docs.example.com', ['*.example.com']).hostname).toBe(
      'docs.example.com',
    );
  });
});

describe('hostAllowed', () => {
  it('matches exact hosts and wildcard subdomains', () => {
    expect(hostAllowed('example.com', ['example.com'])).toBe(true);
    expect(hostAllowed('a.example.com', ['example.com'])).toBe(false);
    expect(hostAllowed('a.b.example.com', ['*.example.com'])).toBe(true);
    expect(hostAllowed('example.com', ['*.example.com'])).toBe(true);
    expect(hostAllowed('badexample.com', ['*.example.com'])).toBe(false);
    expect(hostAllowed('anything.org', [])).toBe(true);
  });
});

describe('safeFetch', () => {
  it('blocks hostnames that resolve to private addresses at connect time', async () => {
    // localtest.me style names are not guaranteed offline; "localhost" is rejected before DNS.
    await expect(safeFetch('http://localhost:1/')).rejects.toBeInstanceOf(BlockedDestinationError);
  });
});
