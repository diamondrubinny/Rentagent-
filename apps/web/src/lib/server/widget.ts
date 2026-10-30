import 'server-only';
import { createHmac, randomBytes } from 'node:crypto';
import { getServerEnv, rateLimit, safeEqual } from '@rentagent/core';
import {
  type Challenge,
  createChallenge,
  randomInt,
  type Solution,
  verifySolution,
} from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2';
import { apiError, type ApiCaller } from './api-keys';
import { getBranding } from './branding';
import { runnableAgent } from './catalog';
import { clientIpHash, db, encryptionKeyring, redis } from './runtime';

export const WIDGET_TOKEN_PATTERN = /^ra_pk_([0-9a-f]{24})$/;
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const CHALLENGE_TTL_SECONDS = 10 * 60;
export const ORIGINS_KEY = (keyId: string) => `widget:origins:${keyId}`;

export function createWidgetKeyToken(): { keyId: string; token: string } {
  const keyId = randomBytes(12).toString('hex');
  return { keyId, token: `ra_pk_${keyId}` };
}

/**
 * Parses allowed sites (one per line): https origins only, plus http://localhost for
 * testing. Returns null when any line is invalid.
 */
export function parseOrigins(text: string): string[] | null {
  const lines = text
    .split(/[\s,]+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0 || lines.length > 10) return null;
  const origins = new Set<string>();
  for (const line of lines) {
    let url: URL;
    try {
      url = new URL(line);
    } catch {
      return null;
    }
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return null;
    if (url.username || url.password || (url.pathname !== '/' && url.pathname !== '')) return null;
    origins.add(url.origin);
  }
  return [...origins];
}

/** The proxy reads allowed sites from Redis to set `frame-ancestors` on the embed page. */
export async function publishWidgetOrigins(keyId: string, origins: string[] | null) {
  if (origins?.length) await redis().set(ORIGINS_KEY(keyId), JSON.stringify(origins));
  else await redis().del(ORIGINS_KEY(keyId));
}

/** Restores the allowed-sites entry if Redis lost it (e.g. after a restore); never overwrites. */
export async function ensureWidgetOrigins(keyId: string, origins: string[]) {
  if (origins.length) await redis().set(ORIGINS_KEY(keyId), JSON.stringify(origins), 'NX');
}

/** An active widget key with its owner and agent, or null (all failures look the same). */
export async function loadWidgetKey(keyId: string, locale: string) {
  const key = await db().apiKey.findUnique({
    where: { keyId },
    include: { user: { select: { status: true } } },
  });
  if (
    !key ||
    key.kind !== 'PUBLISHABLE' ||
    key.revokedAt ||
    (key.expiresAt && key.expiresAt <= new Date()) ||
    key.user.status !== 'ACTIVE' ||
    key.agentIds.length !== 1 ||
    !(await getBranding()).features.publicApi
  )
    return null;
  const agent = await runnableAgent({ id: key.agentIds[0]! }, locale);
  return agent ? { key, agent } : null;
}

function secret(label: string): string {
  return createHmac('sha256', encryptionKeyring().current).update(`widget:${label}`).digest('hex');
}

/** Invisible proof-of-work challenge (ALTCHA): costs bots CPU, costs people ~1 s. */
export async function createWidgetChallenge(keyId: string): Promise<Challenge> {
  return createChallenge({
    algorithm: 'PBKDF2/SHA-256',
    cost: 1_000,
    counter: randomInt(2_000, 6_000),
    deriveKey,
    data: { k: keyId },
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_SECONDS * 1000),
    hmacSignatureSecret: secret('altcha-signature'),
    hmacKeySignatureSecret: secret('altcha-key'),
  });
}

/** Verifies a solved challenge for this key; each challenge is accepted once. */
export async function verifyWidgetChallenge(
  challenge: Challenge,
  solution: Solution,
  keyId: string,
): Promise<boolean> {
  try {
    if (challenge.parameters.data?.k !== keyId || !challenge.signature) return false;
    const result = await verifySolution({
      challenge,
      solution,
      deriveKey,
      hmacSignatureSecret: secret('altcha-signature'),
      hmacKeySignatureSecret: secret('altcha-key'),
    });
    if (!result.verified) return false;
    const fresh = await redis().set(
      `widget:altcha-used:${challenge.signature}`,
      '1',
      'EX',
      CHALLENGE_TTL_SECONDS + 60,
      'NX',
    );
    return fresh === 'OK';
  } catch {
    return false;
  }
}

function sign(body: string): string {
  return createHmac('sha256', secret('session')).update(body).digest('base64url');
}

/** A signed visitor session: `<payload>.<signature>`; the payload is not secret. */
export function issueWidgetSession(keyId: string): { token: string; visitorId: string } {
  const visitorId = randomBytes(16).toString('hex');
  const body = Buffer.from(
    JSON.stringify({
      k: keyId,
      v: visitorId,
      e: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    }),
  ).toString('base64url');
  return { token: `${body}.${sign(body)}`, visitorId };
}

export function readWidgetSession(token: string): { keyId: string; visitorId: string } | null {
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra !== undefined || !safeEqual(signature, sign(body))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      k?: unknown;
      v?: unknown;
      e?: unknown;
    };
    if (typeof data.k !== 'string' || typeof data.v !== 'string' || typeof data.e !== 'number')
      return null;
    if (data.e < Date.now() / 1000) return null;
    return { keyId: data.k, visitorId: data.v };
  } catch {
    return null;
  }
}

/** Widget endpoints are only called by our own embed page (same origin). */
export function fromEmbedPage(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site');
  if (site) return site === 'same-origin';
  return request.headers.get('origin') === new URL(getServerEnv().APP_URL).origin;
}

export interface WidgetCaller extends ApiCaller {
  visitorId: string;
  dailyRunLimit: number;
}

/** Authenticates a widget request (embed page + visitor session) or returns an error response. */
export async function authenticateWidget(request: Request): Promise<WidgetCaller | Response> {
  if (!fromEmbedPage(request)) return apiError(403, 'forbidden', 'Not allowed.');
  const session = readWidgetSession(request.headers.get('x-widget-session') ?? '');
  if (!session) return apiError(401, 'unauthorized', 'The chat session has expired.');
  const loaded = await loadWidgetKey(session.keyId, 'en');
  if (!loaded) return apiError(401, 'unauthorized', 'This chat is no longer available.');
  const limit = await rateLimit(redis(), `widget-req:${await clientIpHash()}`, 120, 60);
  if (!limit.allowed) return apiError(429, 'rate_limited', 'Too many requests.');
  return {
    keyId: loaded.key.keyId,
    apiKeyId: loaded.key.id,
    userId: loaded.key.userId,
    locale: 'en',
    scopes: ['conversations:write'],
    agentIds: loaded.key.agentIds,
    visitorId: session.visitorId,
    dailyRunLimit: loaded.key.dailyRunLimit ?? 0,
  };
}
