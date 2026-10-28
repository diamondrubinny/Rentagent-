import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  checkOnline,
  decodeLicense,
  evaluateLicense,
  type EvaluateInput,
  hostMatches,
  type LicensePayload,
  verifyCheckResponse,
} from '../src/index';
import { generateVendorKey, newLicenseId, signCheckResponse, signLicense } from '../src/sign';

const vendor = generateVendorKey('k1');
const other = generateVendorKey('k1');
const keys = [vendor.publicKey];
const NOW = new Date('2026-10-28T12:00:00Z');

function payload(extra: Partial<LicensePayload> = {}): LicensePayload {
  return {
    v: 1,
    kid: 'k1',
    id: 'lic_test_123456',
    licensee: 'Acme Ltd',
    domains: ['agents.acme.example', '*.acme.example'],
    tier: 'pro',
    features: ['white_label', 'future_feature'],
    maxUsers: 100,
    issuedAt: '2026-01-01T00:00:00Z',
    expiresAt: '2027-01-01T00:00:00Z',
    ...extra,
  };
}

function evaluate(extra: Partial<EvaluateInput> = {}) {
  return evaluateLicense({
    token: signLicense(payload(), vendor.privateKey),
    keys,
    host: 'agents.acme.example',
    now: NOW,
    online: false,
    activatedAt: null,
    check: null,
    userCount: 5,
    ...extra,
  });
}

describe('license tokens', () => {
  it('round-trips a signed license', () => {
    const token = signLicense(payload(), vendor.privateKey);
    expect(token).toMatch(/^RA1\.[\w-]+\.[\w-]{86}$/);
    const decoded = decodeLicense(token, keys);
    expect(decoded).toEqual({ ok: true, payload: payload() });
  });

  it('rejects tampered, foreign-key and malformed tokens', () => {
    const token = signLicense(payload(), vendor.privateKey);
    const [prefix, body, sig] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...payload(), domains: ['evil.example'] }),
    ).toString('base64url');
    expect(decodeLicense(`${prefix}.${forged}.${sig}`, keys)).toEqual({
      ok: false,
      reason: 'signature',
    });
    expect(decodeLicense(signLicense(payload(), other.privateKey), keys).ok).toBe(false);
    expect(decodeLicense(token, []).ok).toBe(false);
    expect(decodeLicense(`RA2.${body}.${sig}`, keys).ok).toBe(false);
    expect(decodeLicense('nonsense', keys).ok).toBe(false);
    expect(decodeLicense('RA1.!!!.x', keys).ok).toBe(false);
    expect(decodeLicense(`RA1.${'a'.repeat(5000)}.x`, keys).ok).toBe(false);
  });

  it('refuses to sign or accept payloads with unknown fields', () => {
    expect(() =>
      signLicense({ ...payload(), extra: true } as unknown as LicensePayload, vendor.privateKey),
    ).toThrow();
  });

  it('matches domains and wildcards, and always allows local development', () => {
    const domains = ['agents.acme.example', '*.acme.example'];
    expect(hostMatches('agents.acme.example', domains)).toBe(true);
    expect(hostMatches('AI.Acme.Example.', domains)).toBe(true);
    expect(hostMatches('acme.example.evil.com', domains)).toBe(false);
    expect(hostMatches('notacme.example', domains)).toBe(false);
    expect(hostMatches('localhost', domains)).toBe(true);
  });
});

describe('evaluateLicense', () => {
  it('reports the license state', () => {
    expect(evaluate({ token: '' }).status).toBe('none');
    expect(evaluate({ token: 'RA1.x.y' }).status).toBe('invalid');
    const valid = evaluate();
    expect(valid.status).toBe('valid');
    expect(valid.features).toEqual(['white_label']);
    expect(valid.overUserLimit).toBe(false);
    expect(evaluate({ userCount: 101 }).overUserLimit).toBe(true);
    expect(evaluate({ host: 'other.example' })).toMatchObject({
      status: 'domain_mismatch',
      features: [],
    });
    expect(evaluate({ now: new Date('2027-01-01T00:00:00Z') }).status).toBe('expired');
    expect(evaluate({ now: new Date('2025-12-31T00:00:00Z') }).status).toBe('not_yet_valid');
  });

  it('applies online checks with a grace period', () => {
    const day = 86_400_000;
    const at = (days: number) => new Date(NOW.getTime() - days * day).toISOString();
    expect(evaluate({ online: true, activatedAt: at(3) }).status).toBe('valid');
    expect(evaluate({ online: true, activatedAt: at(15) }).status).toBe('unverified');
    const failing = {
      lastAttemptAt: at(0),
      lastSuccessAt: at(10),
      status: 'valid' as const,
    };
    expect(evaluate({ online: true, activatedAt: at(30), check: failing })).toMatchObject({
      status: 'valid',
      graceDaysLeft: 4,
    });
    expect(evaluate({ online: true, check: { ...failing, lastSuccessAt: at(20) } }).status).toBe(
      'unverified',
    );
    expect(
      evaluate({ online: true, check: { ...failing, lastSuccessAt: at(1), status: 'revoked' } })
        .status,
    ).toBe('revoked');
    // Offline mode ignores stale check results entirely.
    expect(evaluate({ check: { ...failing, status: 'revoked' } }).status).toBe('valid');
  });
});

describe('online check', () => {
  let answer: (body: { licenseId: string; nonce: string }) => unknown;
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(answer(JSON.parse(raw))));
    });
  });
  let url = '';
  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server.close());
  const request = { licenseId: 'lic_test_123456', domain: 'agents.acme.example', version: '1.0' };
  const signed = (body: { licenseId: string; nonce: string }, extra = {}) =>
    signCheckResponse(
      {
        licenseId: body.licenseId,
        nonce: body.nonce,
        status: 'valid',
        checkedAt: new Date().toISOString(),
        ...extra,
      },
      'k1',
      vendor.privateKey,
    );

  it('accepts a signed answer for this request', async () => {
    answer = (body) => signed(body, { status: 'revoked' });
    expect(await checkOnline(url, request, keys)).toMatchObject({ status: 'revoked' });
  });

  it('rejects replays, foreign signatures and answers for other licenses', async () => {
    answer = (body) => signed({ ...body, nonce: 'replayed-nonce-1234567' });
    expect(await checkOnline(url, request, keys)).toBeNull();
    answer = (body) => signed({ ...body, licenseId: 'lic_other_123456' });
    expect(await checkOnline(url, request, keys)).toBeNull();
    answer = (body) =>
      signCheckResponse(
        { ...body, status: 'valid', checkedAt: new Date().toISOString() },
        'k1',
        other.privateKey,
      );
    expect(await checkOnline(url, request, keys)).toBeNull();
    answer = (body) => signed(body, { checkedAt: '2020-01-01T00:00:00Z' });
    expect(await checkOnline(url, request, keys)).toBeNull();
    answer = () => ({ nope: true });
    expect(await checkOnline(url, request, keys)).toBeNull();
    expect(await checkOnline('http://127.0.0.1:1', request, keys, { timeoutMs: 500 })).toBeNull();
  });

  it('verifies a response independently of transport', () => {
    const body = { licenseId: 'lic_test_123456', nonce: 'n'.repeat(20) };
    expect(verifyCheckResponse(signed(body), { ...body, keys, now: new Date() })).toMatchObject({
      status: 'valid',
    });
    expect(newLicenseId()).toMatch(/^lic_[\w-]{16}$/);
  });
});
