'use server';

import { normalizeSingleLine } from '@rentagent/shared';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { API_SCOPES, createApiKeyToken, MAX_KEYS_PER_USER } from '@/lib/server/api-keys';
import { audit } from '@/lib/server/audit';
import { getBranding } from '@/lib/server/branding';
import { runnableAgents } from '@/lib/server/catalog';
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
  const active = await db().apiKey.count({ where: { userId: user.id, revokedAt: null } });
  if (active >= MAX_KEYS_PER_USER) return { ok: false, error: 'tooManyKeys' };
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
  // Ownership is part of the update; revoking stays possible when the API is turned off.
  const { count } = await db().apiKey.updateMany({
    where: { id, userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (!count) return { ok: false, error: 'notFound' };
  await audit('api.key_revoked', { actorId: user.id, target: `api_key:${id}` });
  revalidatePath('/[locale]/account/api', 'page');
  return { ok: true };
}
