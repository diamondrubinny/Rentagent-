import type { IncomingMessage, ServerResponse } from 'node:http';
import { checkRequestSchema } from '@rentagent/license';
import { signCheckResponse } from '@rentagent/license/sign';
import type { ServerConfig } from './config';
import type { LicenseStore } from './store';

const MAX_BODY_BYTES = 2048;
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60 * 60 * 1000;

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(JSON.stringify(body));
}

/** Sliding-window limiter per client address (in memory; one process is enough). */
function rateLimiter(now: () => number) {
  const hits = new Map<string, number[]>();
  return (key: string): boolean => {
    const start = now() - RATE_WINDOW_MS;
    const recent = (hits.get(key) ?? []).filter((at) => at > start);
    if (recent.length >= RATE_LIMIT) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now());
    hits.set(key, recent);
    if (hits.size > 50_000) hits.clear();
    return true;
  };
}

async function readBody(req: IncomingMessage): Promise<string | null> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) return null;
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * License server: answers signed status checks. Unknown and revoked licenses are
 * reported as such; expiry and domains are enforced by the installation itself.
 */
export function createHandler(
  config: ServerConfig,
  store: LicenseStore,
  { now = () => Date.now() }: { now?: () => number } = {},
) {
  const allow = rateLimiter(now);
  return async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true });
      if (url.pathname !== '/v1/check') return send(res, 404, { error: 'not_found' });
      if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
      const forwarded = config.trustProxy
        ? String(req.headers['x-forwarded-for'] ?? '')
            .split(',')[0]
            ?.trim()
        : '';
      if (!allow(forwarded || req.socket.remoteAddress || 'unknown'))
        return send(res, 429, { error: 'rate_limited' });
      const raw = await readBody(req);
      if (raw === null) return send(res, 413, { error: 'too_large' });
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        return send(res, 400, { error: 'invalid_json' });
      }
      const parsed = checkRequestSchema.safeParse(json);
      if (!parsed.success) return send(res, 400, { error: 'invalid_request' });
      const { licenseId, domain, version, nonce } = parsed.data;
      const checkedAt = new Date(now()).toISOString();
      // Only known licenses are updated, so random ids cannot grow the store.
      const record = await store.update(licenseId, (current) =>
        current
          ? {
              ...current,
              lastCheck: { at: checkedAt, domain: domain.toLowerCase(), version },
            }
          : null,
      );
      const status = !record ? 'unknown' : record.revokedAt ? 'revoked' : 'valid';
      return send(
        res,
        200,
        signCheckResponse({ licenseId, nonce, status, checkedAt }, config.kid, config.privateKey),
      );
    } catch {
      return send(res, 500, { error: 'internal' });
    }
  };
}
