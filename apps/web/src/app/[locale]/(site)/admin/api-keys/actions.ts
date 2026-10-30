'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { type ActionResult, authorizeAction } from '@/lib/server/admin-action';
import { audit } from '@/lib/server/audit';
import { db } from '@/lib/server/runtime';
import { publishWidgetOrigins } from '@/lib/server/widget';

/** Staff can stop any key (abuse, leaked key); the owner sees it as revoked. */
export async function adminRevokeApiKey(id: string): Promise<ActionResult> {
  const actor = await authorizeAction('users.manage');
  if (!actor) return { ok: false, error: 'forbidden' };
  if (!z.uuid().safeParse(id).success) return { ok: false, error: 'notFound' };
  const key = await db().apiKey.findFirst({
    where: { id, revokedAt: null },
    select: { userId: true },
  });
  if (!key) return { ok: false, error: 'notFound' };
  await db().apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  await audit('api.key_revoked_by_staff', {
    actorId: actor.id,
    target: `api_key:${id}`,
    meta: { owner: key.userId },
  });
  revalidatePath('/[locale]/admin/api-keys', 'page');
  return { ok: true };
}
