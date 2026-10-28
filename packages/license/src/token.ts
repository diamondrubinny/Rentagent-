import { createPublicKey, verify } from 'node:crypto';
import { z } from 'zod';

/** Features a license can unlock. Unknown names in a token are ignored (newer vendor). */
export const LICENSE_FEATURES = ['white_label'] as const;
export type LicenseFeature = (typeof LICENSE_FEATURES)[number];
export const LICENSE_TIERS = ['standard', 'pro', 'enterprise'] as const;

export interface VendorKey {
  kid: string;
  /** Raw Ed25519 public key, base64url (the JWK "x" value). */
  x: string;
}

const TOKEN_PREFIX = 'RA1';
const MAX_TOKEN_LENGTH = 4096;

const hostPattern = z
  .string()
  .max(253)
  .regex(/^(\*\.)?([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/);

const isoDate = z.iso.datetime({ offset: true });

export const licensePayloadSchema = z.strictObject({
  v: z.literal(1),
  kid: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/),
  id: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  licensee: z.string().min(1).max(200),
  domains: z.array(hostPattern).min(1).max(20),
  tier: z.enum(LICENSE_TIERS),
  features: z.array(z.string().regex(/^[a-z_]{1,40}$/)).max(20),
  maxUsers: z.number().int().positive().nullable(),
  issuedAt: isoDate,
  expiresAt: isoDate.nullable(),
});
export type LicensePayload = z.infer<typeof licensePayloadSchema>;

export function base64url(bytes: Buffer): string {
  return bytes.toString('base64url');
}

function publicKeyOf(key: VendorKey) {
  return createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: key.x }, format: 'jwk' });
}

/** Verifies an Ed25519 signature over `message` with the key named `kid`. */
export function verifySigned(
  message: string,
  signature: string,
  kid: string,
  keys: readonly VendorKey[],
): boolean {
  const key = keys.find((candidate) => candidate.kid === kid);
  if (!key || !/^[A-Za-z0-9_-]{80,90}$/.test(signature)) return false;
  try {
    return verify(
      null,
      Buffer.from(message),
      publicKeyOf(key),
      Buffer.from(signature, 'base64url'),
    );
  } catch {
    return false;
  }
}

export type DecodeResult =
  { ok: true; payload: LicensePayload } | { ok: false; reason: 'malformed' | 'signature' };

/**
 * Parses and verifies a license token `RA1.<payload>.<signature>`. The signature
 * is checked before the payload is trusted; the payload must match the schema
 * exactly (unknown fields are rejected).
 */
export function decodeLicense(token: string, keys: readonly VendorKey[]): DecodeResult {
  const trimmed = token.trim();
  if (trimmed.length > MAX_TOKEN_LENGTH) return { ok: false, reason: 'malformed' };
  const parts = trimmed.split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX || !/^[A-Za-z0-9_-]+$/.test(parts[1]!))
    return { ok: false, reason: 'malformed' };
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  const kid = (raw as { kid?: unknown } | null)?.kid;
  if (typeof kid !== 'string') return { ok: false, reason: 'malformed' };
  if (!verifySigned(`${TOKEN_PREFIX}.${parts[1]}`, parts[2]!, kid, keys))
    return { ok: false, reason: 'signature' };
  const parsed = licensePayloadSchema.safeParse(raw);
  return parsed.success ? { ok: true, payload: parsed.data } : { ok: false, reason: 'malformed' };
}

/** True when `host` is covered by one of the license's domains (`*.x` covers subdomains). */
export function hostMatches(host: string, domains: readonly string[]): boolean {
  const name = host.toLowerCase().replace(/\.$/, '');
  // Local development and testing never need a license match.
  if (
    name === 'localhost' ||
    name.endsWith('.localhost') ||
    name === '127.0.0.1' ||
    name === '[::1]'
  )
    return true;
  return domains.some((domain) =>
    domain.startsWith('*.') ? name.endsWith(domain.slice(1)) : name === domain,
  );
}

export const TOKEN_FORMAT = { prefix: TOKEN_PREFIX } as const;
