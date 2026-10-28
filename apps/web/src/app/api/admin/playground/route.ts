import { AiUnavailableError, GatewayCallError, stream, type Target } from '@rentagent/ai-gateway';
import { getServerEnv, rateLimit } from '@rentagent/core';
import { can, requiresTwoFactor } from '@rentagent/shared';
import { z } from 'zod';
import { gatewayDeps } from '@/lib/server/ai';
import { redis } from '@/lib/server/runtime';
import { getCurrentUser } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  target: z.union([z.object({ modelId: z.uuid() }), z.object({ policyId: z.uuid() })]),
  system: z.string().max(4000).optional(),
  prompt: z.string().min(1).max(8000),
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

/**
 * Admin playground: streams a test generation as Server-Sent Events.
 * Events: `delta` (text), `done` (summary), `error` (kind only).
 */
export async function POST(request: Request) {
  // Cookie-authenticated POST: only accept same-origin requests.
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(getServerEnv().APP_URL).origin)
    return json(403, { error: 'forbidden' });

  const user = await getCurrentUser();
  if (
    !user ||
    !can(user.role, 'providers.manage') ||
    (requiresTwoFactor(user.role) && !user.twoFactorEnabled)
  ) {
    return json(403, { error: 'forbidden' });
  }
  const limit = await rateLimit(redis(), `playground:${user.id}`, 20, 60);
  if (!limit.allowed) return json(429, { error: 'rate_limited' });

  const raw = await request.text();
  if (raw.length > 20_000) return json(413, { error: 'too_large' });
  let payload: unknown;
  try {
    payload = JSON.parse(raw || '{}');
  } catch {
    return json(400, { error: 'invalid' });
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) return json(400, { error: 'invalid' });

  const target: Target = parsed.data.target;
  let handle;
  try {
    handle = await stream(
      gatewayDeps(),
      target,
      {
        system: parsed.data.system || undefined,
        prompt: parsed.data.prompt,
        maxOutputTokens: 1024,
      },
      { purpose: 'playground', userId: user.id },
    );
  } catch (error) {
    if (error instanceof AiUnavailableError) return json(409, { error: error.reason });
    throw error;
  }

  const encoder = new TextEncoder();
  const event = (name: string, data: unknown) =>
    encoder.encode(
      `event: ${name}\ndata: ${JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))}\n\n`,
    );

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const delta of handle.textStream) controller.enqueue(event('delta', delta));
        controller.enqueue(event('done', await handle.done));
      } catch (error) {
        const kind = error instanceof GatewayCallError ? error.kind : 'unknown';
        const attempts = error instanceof GatewayCallError ? error.attempts : [];
        controller.enqueue(event('error', { kind, attempts }));
      } finally {
        controller.close();
      }
    },
    async cancel() {
      // Client disconnected: closing the iterator aborts the provider request.
      await handle.textStream[Symbol.asyncIterator]().return?.(undefined);
    },
  });

  return new Response(body, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      'x-accel-buffering': 'no',
    },
  });
}
