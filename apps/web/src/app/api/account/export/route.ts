import { rateLimit } from '@rentagent/core';
import { apiActiveUser, jsonResponse } from '@/lib/server/api-auth';
import { audit } from '@/lib/server/audit';
import { db, redis } from '@/lib/server/runtime';

export const dynamic = 'force-dynamic';

const MAX_USAGE_ROWS = 10_000;

/**
 * Data export (right of access / portability): everything stored about the
 * signed-in person, as JSON. Security logs about them are included as actions
 * and dates only; IP data is stored hashed and is not reversible.
 */
export async function GET() {
  const user = await apiActiveUser();
  if (!user) return jsonResponse(401, { error: 'unauthorized' });
  const limit = await rateLimit(redis(), `export:${user.id}`, 5, 60 * 60);
  if (!limit.allowed) return jsonResponse(429, { error: 'rate_limited' });

  const [profile, sessions, conversations, usage, events, apiKeys] = await Promise.all([
    db().user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        locale: true,
        role: true,
        twoFactorEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    db().session.findMany({
      where: { userId: user.id },
      select: { createdAt: true, expiresAt: true, ipAddress: true, userAgent: true },
    }),
    db().conversation.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        title: true,
        source: true,
        createdAt: true,
        updatedAt: true,
        agent: { select: { name: true, slug: true } },
        runs: {
          orderBy: { createdAt: 'asc' },
          select: {
            createdAt: true,
            status: true,
            input: true,
            userMessage: true,
            output: true,
            rating: true,
            feedback: true,
            approvals: { select: { toolName: true, input: true, status: true, decidedAt: true } },
          },
        },
      },
    }),
    db().usageRecord.findMany({
      where: { userId: user.id, status: 'SUCCESS' },
      orderBy: { createdAt: 'asc' },
      take: MAX_USAGE_ROWS,
      select: { createdAt: true, purpose: true, inputTokens: true, outputTokens: true },
    }),
    db().auditLog.findMany({
      where: { actorId: user.id },
      orderBy: { createdAt: 'asc' },
      select: { action: true, createdAt: true },
    }),
    // Key metadata only: the secret is never stored and its hash is not exported.
    db().apiKey.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
      select: {
        name: true,
        scopes: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
      },
    }),
  ]);
  await audit('privacy.data_exported', { actorId: user.id });

  const body = JSON.stringify(
    {
      format: 'rentagent.user-export',
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      profile,
      sessions,
      conversations,
      usage,
      apiKeys,
      securityEvents: events,
    },
    null,
    2,
  );
  return new Response(body, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="my-data-${new Date().toISOString().slice(0, 10)}.json"`,
      'cache-control': 'no-store',
    },
  });
}
