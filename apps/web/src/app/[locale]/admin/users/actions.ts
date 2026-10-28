'use server';

import { UserRole, UserStatus } from '@rentagent/db';
import { canAssignRole, canManageUser, isRole } from '@rentagent/shared';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { type ActionResult, authorizeAction } from '@/lib/server/admin-action';
import { audit } from '@/lib/server/audit';
import { db } from '@/lib/server/runtime';

const userIdSchema = z.string().min(1).max(64);

async function loadTarget(userId: unknown) {
  const id = userIdSchema.safeParse(userId);
  if (!id.success) return null;
  const target = await db().user.findUnique({
    where: { id: id.data },
    select: { id: true, role: true },
  });
  return target && isRole(target.role) ? { id: target.id, role: target.role } : null;
}

export async function changeUserRole(userId: string, nextRole: string): Promise<ActionResult> {
  const actor = await authorizeAction('users.manage');
  if (!actor) return { ok: false, error: 'forbidden' };
  if (!isRole(nextRole)) return { ok: false, error: 'invalid' };
  const target = await loadTarget(userId);
  if (!target) return { ok: false, error: 'notFound' };
  if (!canAssignRole(actor, target, nextRole)) return { ok: false, error: 'forbidden' };
  if (target.role === nextRole) return { ok: true };

  const result = await db().$transaction(async (tx) => {
    if (target.role === 'OWNER') {
      const owners = await tx.user.count({
        where: { role: UserRole.OWNER, status: UserStatus.ACTIVE },
      });
      if (owners <= 1) return 'lastOwner' as const;
    }
    await tx.user.update({ where: { id: target.id }, data: { role: nextRole } });
    return 'ok' as const;
  });
  if (result !== 'ok') return { ok: false, error: result };

  await audit('admin.user_role_changed', {
    actorId: actor.id,
    target: `user:${target.id}`,
    meta: { from: target.role, to: nextRole },
  });
  revalidatePath('/[locale]/admin/users', 'page');
  return { ok: true };
}

export async function setUserStatus(userId: string, status: string): Promise<ActionResult> {
  const actor = await authorizeAction('users.manage');
  if (!actor) return { ok: false, error: 'forbidden' };
  if (status !== 'ACTIVE' && status !== 'DISABLED') return { ok: false, error: 'invalid' };
  const target = await loadTarget(userId);
  if (!target) return { ok: false, error: 'notFound' };
  if (!canManageUser(actor, target)) return { ok: false, error: 'forbidden' };

  const result = await db().$transaction(async (tx) => {
    if (status === 'DISABLED' && target.role === 'OWNER') {
      const owners = await tx.user.count({
        where: { role: UserRole.OWNER, status: UserStatus.ACTIVE },
      });
      if (owners <= 1) return 'lastOwner' as const;
    }
    await tx.user.update({ where: { id: target.id }, data: { status } });
    // Disabling signs the user out everywhere immediately.
    if (status === 'DISABLED') await tx.session.deleteMany({ where: { userId: target.id } });
    return 'ok' as const;
  });
  if (result !== 'ok') return { ok: false, error: result };

  await audit(status === 'DISABLED' ? 'admin.user_disabled' : 'admin.user_enabled', {
    actorId: actor.id,
    target: `user:${target.id}`,
  });
  revalidatePath('/[locale]/admin/users', 'page');
  return { ok: true };
}

export async function revokeUserSessions(userId: string): Promise<ActionResult> {
  const actor = await authorizeAction('users.manage');
  if (!actor) return { ok: false, error: 'forbidden' };
  const target = await loadTarget(userId);
  if (!target) return { ok: false, error: 'notFound' };
  if (!canManageUser(actor, target)) return { ok: false, error: 'forbidden' };

  const { count } = await db().session.deleteMany({ where: { userId: target.id } });
  await audit('admin.user_sessions_revoked', {
    actorId: actor.id,
    target: `user:${target.id}`,
    meta: { count },
  });
  return { ok: true };
}
