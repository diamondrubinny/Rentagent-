import 'server-only';
import { randomBytes } from 'node:crypto';
import { rateLimit, safeEqual, sha256Hex } from '@rentagent/core';
import { getBranding } from './branding';
import { clientIpHash, db, redis } from './runtime';

export const API_SCOPES = ['agents:read', 'conversations:write', 'approvals:write'] as const;
export type ApiScope = (typeof API_SCOPES)[number];
export const MAX_KEYS_PER_USER = 20;

const TOKEN_PATTERN = /^ra_sk_([0-9a-f]{24})_([A-Za-z0-9_-]{43})$/;
/** Requests per minute per key, and failed authentications per minute per client. */
const KEY_RATE_LIMIT = 120;
const FAILED_AUTH_LIMIT = 20;

/** A new key: the full token is shown once; only the hash is stored. */
export function createApiKeyToken(): { keyId: string; token: string; secretHash: string } {
  const keyId = randomBytes(12).toString('hex');
  const token = `ra_sk_${keyId}_${randomBytes(32).toString('base64url')}`;
  return { keyId, token, secretHash: sha256Hex(token) };
}

/** Errors share one shape: { "error": { "code": "...", "message": "..." } }. */
export function apiError(status: number, code: string, message: string, headers?: HeadersInit) {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

export function apiJson(status: number, body: unknown) {
  return new Response(
    JSON.stringify(body, (_key, value) => (typeof value === 'bigint' ? value.toString() : value)),
    { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } },
  );
}

export interface ApiCaller {
  keyId: string;
  apiKeyId: string;
  userId: string;
  locale: string;
  scopes: string[];
  agentIds: string[];
  /** Widget sessions: limits every read to this visitor's conversations. */
  visitorId?: string;
}

/**
 * Authenticates `Authorization: Bearer ra_sk_…` and checks the scope. Returns the
 * caller or a ready error response. Unknown, revoked and expired keys look the same.
 */
export async function authenticateApi(
  request: Request,
  scope: ApiScope,
): Promise<ApiCaller | Response> {
  const unauthorized = () =>
    apiError(401, 'unauthorized', 'A valid API key is required.', {
      'www-authenticate': 'Bearer',
    });
  const ipKey = `api-auth-fail:${await clientIpHash()}`;
  const header = request.headers.get('authorization') ?? '';
  const match = TOKEN_PATTERN.exec(header.replace(/^Bearer\s+/i, '').trim());
  const fail = async () => {
    const limited = !(await rateLimit(redis(), ipKey, FAILED_AUTH_LIMIT, 60)).allowed;
    return limited ? apiError(429, 'rate_limited', 'Too many failed attempts.') : unauthorized();
  };
  if (!match) return fail();
  const key = await db().apiKey.findUnique({
    where: { keyId: match[1]! },
    include: { user: { select: { id: true, status: true, locale: true } } },
  });
  const now = new Date();
  if (
    !key ||
    key.kind !== 'SECRET' ||
    !safeEqual(key.secretHash, sha256Hex(match[0])) ||
    key.revokedAt ||
    (key.expiresAt && key.expiresAt <= now) ||
    key.user.status !== 'ACTIVE'
  )
    return fail();
  if (!(await getBranding()).features.publicApi)
    return apiError(403, 'api_disabled', 'The API is not enabled on this site.');
  if (!key.scopes.includes(scope))
    return apiError(403, 'insufficient_scope', `This key lacks the "${scope}" scope.`);
  const limit = await rateLimit(redis(), `api-key:${key.id}`, KEY_RATE_LIMIT, 60);
  if (!limit.allowed)
    return apiError(429, 'rate_limited', 'Too many requests for this key.', {
      'retry-after': '60',
    });
  // Throttled so busy keys do not write on every request.
  if (!key.lastUsedAt || now.getTime() - key.lastUsedAt.getTime() > 60_000)
    await db().apiKey.update({ where: { id: key.id }, data: { lastUsedAt: now } });
  return {
    keyId: key.keyId,
    apiKeyId: key.id,
    userId: key.userId,
    locale: key.user.locale ?? 'en',
    scopes: key.scopes,
    agentIds: key.agentIds,
  };
}

/** Maps internal result codes to HTTP responses for the API. */
export function apiResultError(error: string, fieldErrors?: Record<string, string>): Response {
  const table: Record<string, [number, string]> = {
    notFound: [404, 'Not found.'],
    invalid: [422, 'The request is invalid.'],
    rateLimited: [429, 'Too many runs; try again in a minute.'],
    dailyLimit: [429, 'The daily limit of runs is reached.'],
    insufficientCredits: [402, 'Not enough credits.'],
    busy: [409, 'The previous turn is still running.'],
    followUpsDisabled: [409, 'This agent does not accept follow-up messages.'],
    agentUnavailable: [409, 'The agent is no longer available.'],
    alreadyDecided: [409, 'This action was already decided.'],
    alreadyFinished: [409, 'The run has already finished.'],
    notFinished: [409, 'The run has not finished.'],
  };
  const [status, message] = table[error] ?? [400, 'The request failed.'];
  const code = error.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  const response = apiError(status, code, message);
  if (!fieldErrors) return response;
  return new Response(JSON.stringify({ error: { code, message, fields: fieldErrors } }), {
    status,
    headers: response.headers,
  });
}

/** Conversations started through the API in the last 30 days, per key (admin overview). */
export async function apiUsageLast30Days(): Promise<Map<string | null, number>> {
  const rows = await db().conversation.groupBy({
    by: ['apiKeyId'],
    where: { source: 'API', createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.apiKeyId, row._count._all]));
}
