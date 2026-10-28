import 'server-only';
import { can, type Permission, requiresTwoFactor, type Role } from '@rentagent/shared';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { redirect } from '@/i18n/navigation';
import { getAuth } from './auth';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: string;
  locale: string | null;
  twoFactorEnabled: boolean;
}

/** The current session (validated against the database on every request), cached per render. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const user = session.user;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: (user.role ?? 'USER') as Role,
    status: user.status ?? 'ACTIVE',
    locale: user.locale ?? null,
    twoFactorEnabled: Boolean(user.twoFactorEnabled),
  };
});

export async function requireUser(locale: string, nextPath: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect({ href: { pathname: '/sign-in', query: { next: `/${locale}${nextPath}` } }, locale });
  }
  return user!;
}

/**
 * Server-side authorization for admin pages and actions. Users without the
 * permission get a 404 (the admin area is not advertised). Roles with admin
 * access must have two-factor authentication enabled.
 */
export async function requirePermission(
  locale: string,
  permission: Permission,
  nextPath = '/admin',
): Promise<SessionUser> {
  const user = await requireUser(locale, nextPath);
  if (!can(user.role, permission)) notFound();
  if (requiresTwoFactor(user.role) && !user.twoFactorEnabled) {
    redirect({ href: { pathname: '/account/security', query: { mfa: 'required' } }, locale });
  }
  return user;
}
