'use server';

import { RoutingStrategy } from '@rentagent/db';
import { normalizeSingleLine } from '@rentagent/shared';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { authorizeAction } from '@/lib/server/admin-action';
import { audit } from '@/lib/server/audit';
import { db } from '@/lib/server/runtime';
import type { FormResult } from '../providers/actions';

const policySchema = z.object({
  name: z
    .string()
    .transform(normalizeSingleLine)
    .pipe(z.string().min(1, { error: 'required' }).max(80, { error: 'tooLong' })),
  strategy: z.enum(RoutingStrategy, { error: 'invalidOption' }),
  modelIds: z.array(z.uuid()).min(1, { error: 'chainRequired' }).max(20, { error: 'tooLong' }),
  isDefault: z.boolean(),
});

export async function savePolicy(
  policyId: string | null,
  input: { name: string; strategy: string; modelIds: string[]; isDefault: boolean },
): Promise<FormResult> {
  const actor = await authorizeAction('providers.manage');
  if (!actor) return { ok: false, error: 'forbidden' };
  if (policyId && !z.uuid().safeParse(policyId).success) return { ok: false, error: 'invalid' };
  const parsed = policySchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { ok: false, error: 'invalid', fieldErrors };
  }
  const data = { ...parsed.data, modelIds: [...new Set(parsed.data.modelIds)] };
  const known = await db().aiModel.count({ where: { id: { in: data.modelIds }, kind: 'CHAT' } });
  if (known !== data.modelIds.length)
    return { ok: false, error: 'invalid', fieldErrors: { modelIds: 'unknownModel' } };

  try {
    const saved = await db().$transaction(async (tx) => {
      // Exactly one default policy.
      if (data.isDefault)
        await tx.routingPolicy.updateMany({
          where: { isDefault: true },
          data: { isDefault: false },
        });
      return policyId
        ? tx.routingPolicy.update({ where: { id: policyId }, data })
        : tx.routingPolicy.create({ data });
    });
    await audit('ai.routing_saved', {
      actorId: actor.id,
      target: `routing:${saved.id}`,
      meta: { strategy: data.strategy, models: data.modelIds.length, isDefault: data.isDefault },
    });
    revalidatePath('/[locale]/admin', 'layout');
    return { ok: true, id: saved.id };
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002')
      return { ok: false, error: 'invalid', fieldErrors: { name: 'duplicateName' } };
    if ((error as { code?: string }).code === 'P2025') return { ok: false, error: 'notFound' };
    throw error;
  }
}

export async function deletePolicy(policyId: string): Promise<FormResult> {
  const actor = await authorizeAction('providers.manage');
  if (!actor) return { ok: false, error: 'forbidden' };
  if (!z.uuid().safeParse(policyId).success) return { ok: false, error: 'invalid' };
  const { count } = await db().routingPolicy.deleteMany({ where: { id: policyId } });
  if (count === 0) return { ok: false, error: 'notFound' };
  await audit('ai.routing_deleted', { actorId: actor.id, target: `routing:${policyId}` });
  revalidatePath('/[locale]/admin', 'layout');
  return { ok: true };
}
