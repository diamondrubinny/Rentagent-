import 'server-only';
import { getServerEnv } from '@rentagent/core';
import { can, type Permission, requiresTwoFactor } from '@rentagent/shared';
import { getCurrentUser, type SessionUser } from './session';

export const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

/** Same-origin check for cookie-authenticated state-changing requests. */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  return Boolean(origin) && origin === new URL(getServerEnv().APP_URL).origin;
}

/** Permission + 2FA check for admin API routes (pages use requirePermission). */
export async function apiUser(permission: Permission): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  if (!user || user.status !== 'ACTIVE' || !can(user.role, permission)) return null;
  if (requiresTwoFactor(user.role) && !user.twoFactorEnabled) return null;
  return user;
}

/** Any signed-in, active account (end-user API routes; ownership is checked by the caller). */
export async function apiActiveUser(): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  return user && user.status === 'ACTIVE' ? user : null;
}
