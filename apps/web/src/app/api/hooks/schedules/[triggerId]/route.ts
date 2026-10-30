import { enqueueSystemJob, getServerEnv, rateLimit, sha256Hex } from '@rentagent/core';
import { PAYLOAD_MAX_CHARS } from '@rentagent/shared';
import { verifyWebhookSignature } from '@rentagent/webhooks';
import { apiError, apiJson } from '@/lib/server/api-keys';
import { db, redis } from '@/lib/server/runtime';
import { schedulesEnabled, triggerSecret } from '@/lib/server/schedules';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 64 * 1024;

/**
 * POST /api/hooks/schedules/{triggerId} — starts a scheduled task from another system.
 * Signed like outgoing webhooks: `x-rentagent-signature: t=<unix>,v1=<HMAC-SHA256 of
 * "t.body">`; requests older than 5 minutes or seen before are refused. The body (any
 * text, e.g. JSON) replaces {{payload}} in the task fields.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ triggerId: string }> },
) {
  const { triggerId } = await params;
  const denied = () => apiError(401, 'unauthorized', 'Invalid trigger or signature.');
  if (!/^[0-9a-f]{24}$/.test(triggerId) || !(await schedulesEnabled())) return denied();
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES)
    return apiError(413, 'too_large', 'The body is too large.');
  const body = await request.text();
  if (Buffer.byteLength(body) > MAX_BODY_BYTES)
    return apiError(413, 'too_large', 'The body is too large.');
  const schedule = await db().schedule.findFirst({
    where: { triggerId, enabled: true },
    select: { id: true, triggerSecretEncrypted: true },
  });
  const signature = request.headers.get('x-rentagent-signature') ?? '';
  if (
    !schedule?.triggerSecretEncrypted ||
    !verifyWebhookSignature(
      triggerSecret(triggerId, schedule.triggerSecretEncrypted),
      body,
      signature,
    )
  )
    return denied();
  // The same signed request is accepted once (no replay within the 5-minute window).
  const fresh = await redis().set(`trigger-seen:${sha256Hex(signature)}`, '1', 'EX', 600, 'NX');
  if (fresh !== 'OK') return apiError(409, 'duplicate', 'This request was already received.');
  const limit = await rateLimit(redis(), `trigger:${schedule.id}`, 60, 3600);
  if (!limit.allowed)
    return apiError(429, 'rate_limited', 'Too many trigger calls.', { 'retry-after': '3600' });
  await enqueueSystemJob(getServerEnv().REDIS_URL, {
    name: 'schedule-trigger',
    data: { scheduleId: schedule.id, payload: body.slice(0, PAYLOAD_MAX_CHARS) },
  });
  return apiJson(202, { accepted: true });
}
