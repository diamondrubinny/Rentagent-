import { describe, expect, it } from 'vitest';
import { accountSchema, can, canAssignRole, requiresTwoFactor } from '../src/auth';

describe('permissions', () => {
  it('grants owners everything and users nothing', () => {
    expect(can('OWNER', 'roles.assignPrivileged')).toBe(true);
    expect(can('ADMIN', 'roles.assignPrivileged')).toBe(false);
    expect(can('ADMIN', 'users.manage')).toBe(true);
    expect(can('USER', 'admin.access')).toBe(false);
    expect(can('SUPPORT', 'users.manage')).toBe(false);
    expect(can('SUPPORT', 'users.read')).toBe(true);
  });

  it('rejects unknown roles', () => {
    expect(can('SUPERUSER', 'admin.access')).toBe(false);
    expect(can(undefined, 'admin.access')).toBe(false);
  });

  it('requires 2FA for every role with admin access', () => {
    expect(requiresTwoFactor('OWNER')).toBe(true);
    expect(requiresTwoFactor('AGENT_MANAGER')).toBe(true);
    expect(requiresTwoFactor('USER')).toBe(false);
  });
});

describe('canAssignRole', () => {
  const owner = { id: 'o', role: 'OWNER' as const };
  const admin = { id: 'a', role: 'ADMIN' as const };
  const user = { id: 'u', role: 'USER' as const };

  it('never allows changing your own role', () => {
    expect(canAssignRole(owner, owner, 'USER')).toBe(false);
  });

  it('lets admins manage non-privileged roles only', () => {
    expect(canAssignRole(admin, user, 'AGENT_MANAGER')).toBe(true);
    expect(canAssignRole(admin, user, 'ADMIN')).toBe(false);
    expect(canAssignRole(admin, owner, 'USER')).toBe(false);
    expect(canAssignRole(admin, { id: 'a2', role: 'ADMIN' }, 'USER')).toBe(false);
  });

  it('lets owners grant privileged roles', () => {
    expect(canAssignRole(owner, user, 'ADMIN')).toBe(true);
    expect(canAssignRole(owner, { id: 'o2', role: 'OWNER' }, 'ADMIN')).toBe(true);
  });

  it('denies users without users.manage', () => {
    expect(canAssignRole({ id: 's', role: 'SUPPORT' }, user, 'AGENT_MANAGER')).toBe(false);
  });
});

describe('accountSchema', () => {
  it('normalizes email and checks confirmation', () => {
    const result = accountSchema.safeParse({
      name: ' Dana ',
      email: ' Dana@Example.COM ',
      password: 'correct horse battery',
      passwordConfirm: 'correct horse battery',
    });
    expect(result.success && result.data.email).toBe('dana@example.com');
  });

  it('reports short and mismatched passwords with i18n keys', () => {
    const result = accountSchema.safeParse({
      name: 'x',
      email: 'x@example.com',
      password: 'short',
      passwordConfirm: 'other',
    });
    expect(result.error?.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining(['passwordTooShort']),
    );
  });
});
