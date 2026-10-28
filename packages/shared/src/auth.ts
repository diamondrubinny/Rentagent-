import { z } from 'zod';
import { normalizeSingleLine } from './text';

/** Built-in roles, ordered from most to least privileged. */
export const ROLES = ['OWNER', 'ADMIN', 'AGENT_MANAGER', 'SUPPORT', 'USER'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'admin.access',
  'settings.manage',
  'users.read',
  'users.manage',
  'roles.assignPrivileged',
  'audit.read',
  'agents.manage',
  'providers.manage',
  'billing.manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  OWNER: PERMISSIONS,
  ADMIN: PERMISSIONS.filter((permission) => permission !== 'roles.assignPrivileged'),
  AGENT_MANAGER: ['admin.access', 'agents.manage'],
  SUPPORT: ['admin.access', 'users.read', 'audit.read'],
  USER: [],
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export function can(role: string | null | undefined, permission: Permission): boolean {
  return isRole(role) && ROLE_PERMISSIONS[role].includes(permission);
}

/** Roles with any administrative access must use two-factor authentication. */
export function requiresTwoFactor(role: string | null | undefined): boolean {
  return can(role, 'admin.access');
}

/** Lower number = more privileged. */
export function roleRank(role: Role): number {
  return ROLES.indexOf(role);
}

const isPrivilegedRole = (role: Role) => role === 'OWNER' || role === 'ADMIN';

/**
 * Whether `actor` may manage `target` (change role, disable, revoke sessions).
 * Never yourself, never someone ranked above you, and OWNER/ADMIN accounts
 * only by holders of `roles.assignPrivileged`.
 */
export function canManageUser(
  actor: { id: string; role: Role },
  target: { id: string; role: Role },
): boolean {
  if (actor.id === target.id) return false;
  if (!can(actor.role, 'users.manage')) return false;
  if (roleRank(target.role) < roleRank(actor.role)) return false;
  return !isPrivilegedRole(target.role) || can(actor.role, 'roles.assignPrivileged');
}

/** Whether `actor` may change `target`'s role to `nextRole`. */
export function canAssignRole(
  actor: { id: string; role: Role },
  target: { id: string; role: Role },
  nextRole: Role,
): boolean {
  if (!canManageUser(actor, target)) return false;
  return !isPrivilegedRole(nextRole) || can(actor.role, 'roles.assignPrivileged');
}

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export const USER_STATUSES = ['ACTIVE', 'DISABLED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const REGISTRATION_MODES = ['open', 'closed'] as const;
export type RegistrationMode = (typeof REGISTRATION_MODES)[number];

export const emailField = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .pipe(z.email({ error: 'invalidEmail' }).max(254, { error: 'tooLong' }));

export const nameField = z
  .string()
  .transform(normalizeSingleLine)
  .pipe(z.string().min(1, { error: 'required' }).max(100, { error: 'tooLong' }));

export const passwordField = z
  .string()
  .min(PASSWORD_MIN_LENGTH, { error: 'passwordTooShort' })
  .max(PASSWORD_MAX_LENGTH, { error: 'passwordTooLong' });

/** Account fields used by sign-up and by the owner step of the setup wizard. */
export const accountSchema = z
  .object({
    name: nameField,
    email: emailField,
    password: passwordField,
    passwordConfirm: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    path: ['passwordConfirm'],
    error: 'passwordMismatch',
  });
