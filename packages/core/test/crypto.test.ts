import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  decryptSecret,
  encryptSecret,
  maskSecret,
  needsReencryption,
  parseKeyring,
  safeEqual,
} from '../src/crypto';

const newKey = () => randomBytes(32).toString('base64');

describe('encryptSecret / decryptSecret', () => {
  const keyring = parseKeyring(newKey());

  it('round-trips unicode secrets', () => {
    const secret = 'sk-test-🔑-מפתח';
    const payload = encryptSecret(secret, 'provider:1', keyring);
    expect(payload).not.toContain(secret);
    expect(decryptSecret(payload, 'provider:1', keyring)).toBe(secret);
  });

  it('produces a different ciphertext each time', () => {
    expect(encryptSecret('a', 'c', keyring)).not.toBe(encryptSecret('a', 'c', keyring));
  });

  it('rejects a ciphertext moved to another context', () => {
    const payload = encryptSecret('secret', 'provider:1', keyring);
    expect(() => decryptSecret(payload, 'provider:2', keyring)).toThrow();
  });

  it('detects tampering', () => {
    const payload = encryptSecret('secret', 'ctx', keyring);
    const parts = payload.split('.');
    const data = Buffer.from(parts[4]!, 'base64url');
    data[0] = (data[0] ?? 0) ^ 1;
    parts[4] = data.toString('base64url');
    expect(() => decryptSecret(parts.join('.'), 'ctx', keyring)).toThrow();
  });

  it('decrypts with previous keys during rotation', () => {
    const oldKey = newKey();
    const payload = encryptSecret('secret', 'ctx', parseKeyring(oldKey));
    const rotated = parseKeyring(newKey(), oldKey);
    expect(decryptSecret(payload, 'ctx', rotated)).toBe('secret');
    expect(needsReencryption(payload, rotated)).toBe(true);
  });

  it('rejects keys of the wrong length', () => {
    expect(() => parseKeyring(Buffer.alloc(16).toString('base64'))).toThrow();
  });
});

describe('helpers', () => {
  it('safeEqual compares strings', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });

  it('maskSecret only reveals the last 4 characters', () => {
    expect(maskSecret('sk-1234567890')).toBe('••••7890');
    expect(maskSecret('abc')).toBe('••••');
  });
});
