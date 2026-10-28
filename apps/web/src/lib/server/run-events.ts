import 'server-only';
import { getServerEnv } from '@rentagent/core';
import { Redis } from 'ioredis';

const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'CANCELED']);
const HEARTBEAT_MS = 15_000;
const stringify = (value: unknown) =>
  JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v));

/**
 * Live run updates as Server-Sent Events. Status/step events trigger a fresh
 * snapshot from the database (unnamed events), so the client always renders
 * consistent state; streamed text is forwarded as-is (`event: partial`).
 * The caller authorizes access and decides what a snapshot contains.
 */
export async function runEventStream<S extends { status: string }>(
  request: Request,
  runId: string,
  snapshot: () => Promise<S | null>,
): Promise<Response | null> {
  const first = await snapshot();
  if (!first) return null;

  const encoder = new TextEncoder();
  const subscriber = new Redis(getServerEnv().REDIS_URL, { maxRetriesPerRequest: 3 });
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (chunk: string) => {
        if (!closed) controller.enqueue(encoder.encode(chunk));
      };
      const send = (data: unknown) => write(`data: ${stringify(data)}\n\n`);
      const close = async () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        await subscriber.quit().catch(() => undefined);
        controller.close();
      };
      send(first);
      if (TERMINAL.has(first.status)) return close();

      subscriber.on('message', async (_channel: string, message: string) => {
        let event: { type?: string; text?: unknown } = {};
        try {
          event = JSON.parse(message) as typeof event;
        } catch {
          // Unknown payloads only trigger a refresh.
        }
        if (event.type === 'partial' && typeof event.text === 'string') {
          write(`event: partial\ndata: ${JSON.stringify({ text: event.text })}\n\n`);
          return;
        }
        const next = await snapshot();
        if (!next) return close();
        send(next);
        if (TERMINAL.has(next.status)) await close();
      });
      await subscriber.subscribe(`run:${runId}`);
      // Catch updates that happened between the first snapshot and subscribing.
      const latest = await snapshot();
      if (latest) send(latest);
      if (latest && TERMINAL.has(latest.status)) return close();
      heartbeat = setInterval(() => write(': keep-alive\n\n'), HEARTBEAT_MS);
      request.signal.addEventListener('abort', () => void close());
    },
    async cancel() {
      closed = true;
      clearInterval(heartbeat);
      await subscriber.quit().catch(() => undefined);
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
