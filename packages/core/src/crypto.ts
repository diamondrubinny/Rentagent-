import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const FORMAT_VERSION = 'v1';

export interface Keyring {
  current: Buffer;
  previous: Buffer[];
}

export function keyId(key: Buffer): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 8);
}

export function parseKeyring(currentBase64: string, previousBase64Csv = ''): Keyring {
  const decode = (value: string) => {
    const key = Buffer.from(value.trim(), 'base64');
    if (key.length !== 32) throw new Error('Encryption keys must be 32 bytes');
    return key;
  };
  return {
    current: decode(currentBase64),
    previous: previousBase64Csv
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .map(decode),
  };
}

/**
 * Encrypts a secret with AES-256-GCM. `context` is bound as additional
 * authenticated data so a ciphertext cannot be moved to another field or row.
 * Output: v1.<keyId>.<iv>.<tag>.<ciphertext> (base64url parts).
 */
export function encryptSecret(plaintext: string, context: string, keyring: Keyring): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, keyring.current, iv);
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    FORMAT_VERSION,
    keyId(keyring.current),
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

export function decryptSecret(payload: string, context: string, keyring: Keyring): string {
  const parts = payload.split('.');
  if (parts.length !== 5 || parts[0] !== FORMAT_VERSION) {
    throw new Error('Unsupported secret format');
  }
  const [, id, ivPart, tagPart, dataPart] = parts as [string, string, string, string, string];
  const key = [keyring.current, ...keyring.previous].find((candidate) => keyId(candidate) === id);
  if (!key) throw new Error('No encryption key available for this secret');
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivPart, 'base64url'));
  decipher.setAAD(Buffer.from(context, 'utf8'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

/** True when the secret was encrypted with an older key and should be re-encrypted. */
export function needsReencryption(payload: string, keyring: Keyring): boolean {
  return payload.split('.')[1] !== keyId(keyring.current);
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Constant-time comparison of two strings (compares SHA-256 digests to equalize length). */
export function safeEqual(a: string, b: string): boolean {
  const left = createHash('sha256').update(a, 'utf8').digest();
  const right = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(left, right);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Returns the last 4 characters for display, never the full secret. */
export function maskSecret(secret: string): string {
  return secret.length <= 4 ? '••••' : `••••${secret.slice(-4)}`;
}
