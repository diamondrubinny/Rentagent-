import { rateLimit } from '@rentagent/core';
import { z } from 'zod';
import { apiError, apiJson } from '@/lib/server/api-keys';
import { readJson } from '@/lib/server/api-v1';
import { clientIpHash, redis } from '@/lib/server/runtime';
import {
  createWidgetChallenge,
  fromEmbedPage,
  loadWidgetKey,
  WIDGET_TOKEN_PATTERN,
} from '@/lib/server/widget';

export const dynamic = 'force-dynamic';

const bodySchema = z.strictObject({ key: z.string().regex(WIDGET_TOKEN_PATTERN) });

/** POST /api/widget/challenge — a proof-of-work challenge before a visitor session. */
export async function POST(request: Request) {
  if (!fromEmbedPage(request)) return apiError(403, 'forbidden', 'Not allowed.');
  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) return apiError(400, 'invalid_request', 'Invalid widget key.');
  const limit = await rateLimit(redis(), `widget-challenge:${await clientIpHash()}`, 30, 600);
  if (!limit.allowed) return apiError(429, 'rate_limited', 'Too many requests.');
  const keyId = WIDGET_TOKEN_PATTERN.exec(parsed.data.key)![1]!;
  if (!(await loadWidgetKey(keyId, 'en'))) return apiError(404, 'not_found', 'Not found.');
  return apiJson(200, await createWidgetChallenge(keyId));
}
