'use server';

import { normalizeSingleLine } from '@rentagent/shared';
import { revalidatePath } from 'next/cache';
import { sha256Hex } from '@rentagent/core';
import { z } from 'zod';
import { API_SCOPES, createApiKeyToken, MAX_KEYS_PER_USER } from '@/lib/server/api-keys';
import { audit } from '@/lib/server/audit';
import { getBranding } from '@/lib/server/branding';
import { runnableAgents } from '@/lib/server/catalog';
import { createWidgetKeyToken, parseOrigins, publishWidgetOrigins } from '@/lib/server/widget';
import { db } from '@/lib/server/runtime';
import { getCurrentUser } from '@/lib/server/session';

export type ApiKeyResult =
  { ok: true; token?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

const createSchema = z.object({
  name: z
    .string()
    .transform(normalizeSingleLine)
    .pipe(z.string().min(1, { error: 'required' }).max(80, { error: 'tooLong' })),
  scopes: z.array(z.enum(API_SCOPES)).min(1, { error: 'required' }),
  agentIds: z.array(z.uuid()).max(50),
  expiresInDays: z.union([z.literal(0), z.literal(30), z.literal(90), z.literal(365)]),
});

async function tooManyKeys(userId: string) {
  return (await db().apiKey.count({ where: { userId, revokedAt: null } })) >= MAX_KEYS_PER_USER;
}

async function apiUser() {
  const user = await getCurrentUser();
  if (!user || user.status !== 'ACTIVE') return null;
  return (await getBranding()).features.publicApi ? user : null;
}

/** Creates a key and returns the full token once; only its hash is stored. */
export async function createApiKey(input: {
  name: string;
  scopes: string[];
  agentIds: string[];
  expiresInDays: number;
}): Promise<ApiKeyResult> {
  const user = await apiUser();
  if (!user) return { ok: false, error: 'forbidden' };
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { ok: false, error: 'invalid', fieldErrors };
  }
  if (await tooManyKeys(user.id)) return { ok: false, error: 'tooManyKeys' };
  // Only published agents can be selected.
  const agentIds = parsed.data.agentIds.length
    ? (await runnableAgents('en', parsed.data.agentIds)).map((agent) => agent.id)
    : [];
  if (agentIds.length !== parsed.data.agentIds.length)
    return { ok: false, error: 'invalid', fieldErrors: { agentIds: 'invalidOption' } };
  const { keyId, token, secretHash } = createApiKeyToken();
  const days = parsed.data.expiresInDays;
  const key = await db().apiKey.create({
    data: {
      userId: user.id,
      name: parsed.data.name,
      keyId,
      secretHash,
      scopes: [...new Set(parsed.data.scopes)],
      agentIds,
      expiresAt: days ? new Date(Date.now() + days * 86_400_000) : null,
    },
  });
  await audit('api.key_created', {
    actorId: user.id,
    target: `api_key:${key.id}`,
    meta: { scopes: key.scopes, agents: agentIds.length, expiresInDays: days },
  });
  revalidatePath('/[locale]/account/api', 'page');
  return { ok: true, token };
}

export async function revokeApiKey(id: string): Promise<ApiKeyResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'forbidden' };
  if (!z.uuid().safeParse(id).success) return { ok: false, error: 'notFound' };
  // Ownership is part of the query; revoking stays possible when the API is turned off.
  const key = await db().apiKey.findFirst({
    where: { id, userId: user.id, revokedAt: null },
    select: { keyId: true },
  });
  if (!key) return { ok: false, error: 'notFound' };
  await db().apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  // A widget stops being embeddable at once.
  await publishWidgetOrigins(key.keyId, null);
  await audit('api.key_revoked', { actorId: user.id, target: `api_key:${id}` });
  revalidatePath('/[locale]/account/api', 'page');
  return { ok: true };
}

const widgetSchema = z.object({
  name: z
    .string()
    .transform(normalizeSingleLine)
    .pipe(z.string().min(1, { error: 'required' }).max(80, { error: 'tooLong' })),
  agentId: z.uuid({ error: 'required' }),
  origins: z.string().max(2000, { error: 'tooLong' }),
  dailyRunLimit: z.coerce
    .number({ error: 'invalidNumber' })
    .int({ error: 'invalidNumber' })
    .min(1, { error: 'invalidNumber' })
    .max(100_000, { error: 'invalidNumber' }),
});

/**
 * A website widget key: public by design (it is in the page source), so it is tied
 * to one agent, the sites allowed to embed it, and a daily cap on runs.
 */
export async function createWidgetKey(input: {
  name: string;
  agentId: string;
  origins: string;
  dailyRunLimit: string;
}): Promise<ApiKeyResult> {
  const user = await apiUser();
  if (!user) return { ok: false, error: 'forbidden' };
  const parsed = widgetSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { ok: false, error: 'invalid', fieldErrors };
  }
  const origins = parseOrigins(parsed.data.origins);
  if (!origins) return { ok: false, error: 'invalid', fieldErrors: { origins: 'invalidOrigins' } };
  if (!(await runnableAgents('en', [parsed.data.agentId])).length)
    return { ok: false, error: 'invalid', fieldErrors: { agentId: 'invalidOption' } };
  if (await tooManyKeys(user.id)) return { ok: false, error: 'tooManyKeys' };
  const { keyId, token } = createWidgetKeyToken();
  const key = await db().apiKey.create({
    data: {
      userId: user.id,
      kind: 'PUBLISHABLE',
      name: parsed.data.name,
      keyId,
      // Not a secret: stored for the unique column only.
      secretHash: sha256Hex(token),
      scopes: [],
      agentIds: [parsed.data.agentId],
      origins,
      dailyRunLimit: parsed.data.dailyRunLimit,
    },
  });
  await publishWidgetOrigins(keyId, origins);
  await audit('api.widget_created', {
    actorId: user.id,
    target: `api_key:${key.id}`,
    meta: { origins: origins.length, dailyRunLimit: parsed.data.dailyRunLimit },
  });
  revalidatePath('/[locale]/account/api', 'page');
  return { ok: true, token };
}
