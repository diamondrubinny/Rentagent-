import 'server-only';
import { can, type Permission, requiresTwoFactor } from '@rentagent/shared';
import { getCurrentUser, type SessionUser } from './session';

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Authorization for server actions: same rules as admin pages (permission + 2FA),
 * but returns an error result instead of redirecting.
 */
export async function authorizeAction(permission: Permission): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  if (!user || user.status !== 'ACTIVE' || !can(user.role, permission)) return null;
  if (requiresTwoFactor(user.role) && !user.twoFactorEnabled) return null;
  return user;
}
