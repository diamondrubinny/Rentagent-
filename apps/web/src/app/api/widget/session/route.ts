import type { Challenge, Solution } from 'altcha-lib';
import { z } from 'zod';
import { apiError, apiJson } from '@/lib/server/api-keys';
import { readJson } from '@/lib/server/api-v1';
import {
  fromEmbedPage,
  issueWidgetSession,
  loadWidgetKey,
  verifyWidgetChallenge,
  WIDGET_TOKEN_PATTERN,
} from '@/lib/server/widget';

export const dynamic = 'force-dynamic';

const bodySchema = z.strictObject({
  key: z.string().regex(WIDGET_TOKEN_PATTERN),
  challenge: z.record(z.string(), z.unknown()),
  solution: z.record(z.string(), z.unknown()),
});

/** POST /api/widget/session — exchanges a solved challenge for a visitor session. */
export async function POST(request: Request) {
  if (!fromEmbedPage(request)) return apiError(403, 'forbidden', 'Not allowed.');
  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) return apiError(400, 'invalid_request', 'Invalid request.');
  const keyId = WIDGET_TOKEN_PATTERN.exec(parsed.data.key)![1]!;
  if (!(await loadWidgetKey(keyId, 'en'))) return apiError(404, 'not_found', 'Not found.');
  const verified = await verifyWidgetChallenge(
    parsed.data.challenge as unknown as Challenge,
    parsed.data.solution as unknown as Solution,
    keyId,
  );
  if (!verified) return apiError(403, 'challenge_failed', 'Verification failed. Please try again.');
  const { token } = issueWidgetSession(keyId);
  return apiJson(201, { token });
}
