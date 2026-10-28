import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import {
  decodeLicense,
  hostMatches,
  LICENSE_FEATURES,
  type LicenseFeature,
  type LicensePayload,
  type VendorKey,
  verifySigned,
} from './token';

/** Network problems are tolerated this long before the license counts as unverified. */
export const ONLINE_GRACE_DAYS = 14;
const DAY_MS = 86_400_000;
const CLOCK_SKEW_MS = 5 * 60_000;

/** Result of the last online check, kept in the `license` setting. */
export interface LicenseCheckState {
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  /** The license server's answer at lastSuccessAt. */
  status: 'valid' | 'revoked' | 'unknown' | null;
}

export type LicenseStatus =
  | 'none'
  | 'valid'
  | 'invalid'
  | 'expired'
  | 'not_yet_valid'
  | 'domain_mismatch'
  | 'revoked'
  | 'unverified';

export interface LicenseState {
  status: LicenseStatus;
  /** The verified payload, also for expired/mismatched licenses (for display). */
  license: LicensePayload | null;
  /** Unlocked features; empty unless status is 'valid'. */
  features: LicenseFeature[];
  overUserLimit: boolean;
  /** Days of grace left while the license server cannot be reached (online mode only). */
  graceDaysLeft: number | null;
}

export interface EvaluateInput {
  token: string | null | undefined;
  keys: readonly VendorKey[];
  /** Host name of APP_URL. */
  host: string;
  now: Date;
  /** True when LICENSE_SERVER_URL is configured. */
  online: boolean;
  activatedAt: string | null;
  check: LicenseCheckState | null;
  userCount: number;
}

/** Works out what the installation is licensed for. Never throws. */
export function evaluateLicense(input: EvaluateInput): LicenseState {
  const empty = (status: LicenseStatus, license: LicensePayload | null = null): LicenseState => ({
    status,
    license,
    features: [],
    overUserLimit: false,
    graceDaysLeft: null,
  });
  if (!input.token?.trim()) return empty('none');
  const decoded = decodeLicense(input.token, input.keys);
  if (!decoded.ok) return empty('invalid');
  const license = decoded.payload;
  const now = input.now.getTime();
  if (Date.parse(license.issuedAt) - CLOCK_SKEW_MS > now) return empty('not_yet_valid', license);
  if (license.expiresAt && Date.parse(license.expiresAt) <= now) return empty('expired', license);
  if (!hostMatches(input.host, license.domains)) return empty('domain_mismatch', license);
  let graceDaysLeft: number | null = null;
  if (input.online) {
    if (input.check?.status === 'revoked' || input.check?.status === 'unknown')
      return empty('revoked', license);
    const since = input.check?.lastSuccessAt ?? input.activatedAt;
    const age = since ? now - Date.parse(since) : 0;
    if (age > ONLINE_GRACE_DAYS * DAY_MS) return empty('unverified', license);
    // Only worth showing while checks are actually failing.
    if (
      input.check?.lastAttemptAt &&
      input.check.lastAttemptAt !== input.check.lastSuccessAt &&
      age > DAY_MS
    )
      graceDaysLeft = Math.max(0, Math.ceil((ONLINE_GRACE_DAYS * DAY_MS - age) / DAY_MS));
  }
  return {
    status: 'valid',
    license,
    features: LICENSE_FEATURES.filter((feature) => license.features.includes(feature)),
    overUserLimit: license.maxUsers !== null && input.userCount > license.maxUsers,
    graceDaysLeft,
  };
}

// ---- Online check protocol -------------------------------------------------

export const CHECK_PREFIX = 'RA1-CHECK';

export interface CheckRequest {
  licenseId: string;
  domain: string;
  version: string;
  nonce: string;
}

export const checkRequestSchema = z.strictObject({
  licenseId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  domain: z.string().min(1).max(253),
  version: z.string().max(40),
  nonce: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
});

export const checkBodySchema = z.strictObject({
  licenseId: z.string(),
  nonce: z.string(),
  status: z.enum(['valid', 'revoked', 'unknown']),
  checkedAt: z.iso.datetime({ offset: true }),
});
export type CheckBody = z.infer<typeof checkBodySchema>;

export interface CheckResponse {
  kid: string;
  body: string;
  sig: string;
}

export function newNonce(): string {
  return randomBytes(18).toString('base64url');
}

/**
 * Verifies a license server answer: signed by a vendor key, for this license and
 * this request's nonce (no replay), and timestamped close to now.
 */
export function verifyCheckResponse(
  response: unknown,
  expected: { licenseId: string; nonce: string; keys: readonly VendorKey[]; now: Date },
): CheckBody | null {
  const shape = z
    .object({ kid: z.string().max(32), body: z.string().max(2048), sig: z.string().max(200) })
    .safeParse(response);
  if (!shape.success) return null;
  const { kid, body, sig } = shape.data;
  if (!verifySigned(`${CHECK_PREFIX}.${body}`, sig, kid, expected.keys)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const result = checkBodySchema.safeParse(parsed);
  if (!result.success) return null;
  if (result.data.licenseId !== expected.licenseId || result.data.nonce !== expected.nonce)
    return null;
  if (Math.abs(Date.parse(result.data.checkedAt) - expected.now.getTime()) > DAY_MS) return null;
  return result.data;
}

/**
 * Asks the license server about this license. Sends only the license id, the
 * domain and the software version — never data about users.
 */
export async function checkOnline(
  serverUrl: string,
  request: Omit<CheckRequest, 'nonce'>,
  keys: readonly VendorKey[],
  { now = () => new Date(), timeoutMs = 10_000 }: { now?: () => Date; timeoutMs?: number } = {},
): Promise<CheckBody | null> {
  const nonce = newNonce();
  try {
    const response = await fetch(new URL('/v1/check', serverUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...request, nonce }),
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    const text = await response.text();
    if (text.length > 8192) return null;
    return verifyCheckResponse(JSON.parse(text), {
      licenseId: request.licenseId,
      nonce,
      keys,
      now: now(),
    });
  } catch {
    return null;
  }
}

/**
 * Runs one online check and returns the new check state to store. A failed or
 * unverifiable answer only updates lastAttemptAt, so the grace period applies.
 */
export async function runLicenseCheck(
  input: {
    serverUrl: string;
    token: string;
    host: string;
    version: string;
    keys: readonly VendorKey[];
    previous: LicenseCheckState | null;
  },
  options?: { now?: () => Date; timeoutMs?: number },
): Promise<LicenseCheckState> {
  const now = (options?.now ?? (() => new Date()))().toISOString();
  const previous = input.previous ?? { lastAttemptAt: null, lastSuccessAt: null, status: null };
  const decoded = decodeLicense(input.token, input.keys);
  if (!decoded.ok) return { ...previous, lastAttemptAt: now };
  const answer = await checkOnline(
    input.serverUrl,
    { licenseId: decoded.payload.id, domain: input.host, version: input.version },
    input.keys,
    options,
  );
  return answer
    ? { lastAttemptAt: now, lastSuccessAt: now, status: answer.status }
    : { ...previous, lastAttemptAt: now };
}
