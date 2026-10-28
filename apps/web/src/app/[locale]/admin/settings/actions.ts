'use server';

import { decryptSecret, encryptSecret } from '@rentagent/core';
import { getSetting, settingUpsert } from '@rentagent/db';
import { verifySmtp } from '@rentagent/mail';
import { nameField, REGISTRATION_MODES, SMTP_SECURITY } from '@rentagent/shared';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { type ActionResult, authorizeAction } from '@/lib/server/admin-action';
import { audit } from '@/lib/server/audit';
import { resetAuth } from '@/lib/server/auth';
import { db, encryptionKeyring } from '@/lib/server/runtime';
import { getSiteConfig } from '@/lib/server/site';

const settingsSchema = z.object({
  siteName: nameField.pipe(z.string().max(80, { error: 'tooLong' })),
  registrationMode: z.enum(REGISTRATION_MODES, { error: 'invalidOption' }),
});

export type SettingsResult = ActionResult & { fieldErrors?: Record<string, string> };

export async function updateGeneralSettings(input: {
  siteName: string;
  registrationMode: string;
}): Promise<SettingsResult> {
  const actor = await authorizeAction('settings.manage');
  if (!actor) return { ok: false, error: 'forbidden' };

  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { ok: false, error: 'invalid', fieldErrors };
  }
  const { siteName, registrationMode } = parsed.data;
  // Every account must verify its email, so open registration needs working SMTP.
  if (registrationMode === 'open' && !(await getSiteConfig()).smtpEnabled) {
    return { ok: false, error: 'smtpRequired' };
  }

  await db().$transaction([
    db().setting.upsert(settingUpsert('site.name', siteName, actor.id)),
    db().setting.upsert(settingUpsert('auth.registrationMode', registrationMode, actor.id)),
  ]);
  resetAuth(); // site name (2FA issuer) and sign-up availability are baked into the auth instance
  await audit('settings.updated', {
    actorId: actor.id,
    meta: { keys: ['site.name', 'auth.registrationMode'], registrationMode },
  });
  revalidatePath('/', 'layout');
  return { ok: true };
}

const usageSchema = z.object({
  catalogPublic: z.boolean(),
  userDailyRunLimit: z.coerce
    .number({ error: 'invalidNumber' })
    .int({ error: 'invalidNumber' })
    .min(0, { error: 'invalidNumber' })
    .max(100_000, { error: 'invalidNumber' }),
  runRetentionDays: z.coerce
    .number({ error: 'invalidNumber' })
    .int({ error: 'invalidNumber' })
    .min(0, { error: 'invalidNumber' })
    .max(3650, { error: 'invalidNumber' }),
});

/** Catalog visibility, per-user daily turns and conversation retention. */
export async function updateUsageSettings(input: {
  catalogPublic: boolean;
  userDailyRunLimit: string;
  runRetentionDays: string;
}): Promise<SettingsResult> {
  const actor = await authorizeAction('settings.manage');
  if (!actor) return { ok: false, error: 'forbidden' };
  const parsed = usageSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { ok: false, error: 'invalid', fieldErrors };
  }
  const { catalogPublic, userDailyRunLimit, runRetentionDays } = parsed.data;
  await db().$transaction([
    db().setting.upsert(settingUpsert('agents.catalogPublic', catalogPublic, actor.id)),
    db().setting.upsert(settingUpsert('agents.userDailyRunLimit', userDailyRunLimit, actor.id)),
    db().setting.upsert(settingUpsert('privacy.runRetentionDays', runRetentionDays, actor.id)),
  ]);
  await audit('settings.updated', {
    actorId: actor.id,
    meta: {
      keys: ['agents.catalogPublic', 'agents.userDailyRunLimit', 'privacy.runRetentionDays'],
      catalogPublic,
      userDailyRunLimit,
      runRetentionDays,
    },
  });
  revalidatePath('/', 'layout');
  return { ok: true };
}

const mailSchema = z
  .object({
    enabled: z.boolean(),
    host: z.string().trim().max(253, { error: 'tooLong' }),
    port: z.coerce
      .number({ error: 'invalidPort' })
      .int({ error: 'invalidPort' })
      .min(1, { error: 'invalidPort' })
      .max(65535, { error: 'invalidPort' }),
    security: z.enum(SMTP_SECURITY, { error: 'invalidOption' }),
    user: z.string().trim().max(320, { error: 'tooLong' }),
    password: z.string().max(1024, { error: 'tooLong' }),
    fromEmail: z.string().trim().max(320, { error: 'tooLong' }),
    fromName: z.string().trim().max(120, { error: 'tooLong' }),
  })
  .superRefine((data, ctx) => {
    if (!data.enabled) return;
    if (!data.host) ctx.addIssue({ code: 'custom', path: ['host'], message: 'required' });
    if (!z.email().safeParse(data.fromEmail).success)
      ctx.addIssue({ code: 'custom', path: ['fromEmail'], message: 'invalidEmail' });
  });

/**
 * Outgoing email. The connection is tested before saving; an empty password keeps
 * the stored one (changing the server, security or user requires entering it again).
 */
export async function updateMailSettings(input: {
  enabled: boolean;
  host: string;
  port: string;
  security: string;
  user: string;
  password: string;
  fromEmail: string;
  fromName: string;
}): Promise<SettingsResult> {
  const actor = await authorizeAction('settings.manage');
  if (!actor) return { ok: false, error: 'forbidden' };
  const parsed = mailSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { ok: false, error: 'invalid', fieldErrors };
  }
  const data = parsed.data;
  const current = await getSetting(db(), 'mail.smtp');
  if (!data.enabled && (await getSetting(db(), 'auth.registrationMode')) === 'open')
    return { ok: false, error: 'smtpInUse' };
  const keyring = encryptionKeyring();
  // The stored password is only reused for the same server, connection and account, so it
  // can never be sent to another host or over a weaker connection.
  const sameAccount =
    current?.host === data.host &&
    current?.port === data.port &&
    current?.security === data.security &&
    current?.user === data.user;
  const password =
    data.password ||
    (sameAccount && current?.passwordEncrypted
      ? decryptSecret(current.passwordEncrypted, 'setting:mail.smtp.password', keyring)
      : '');
  if (data.enabled) {
    const reachable = await verifySmtp({
      host: data.host,
      port: data.port,
      security: data.security,
      user: data.user,
      password,
    });
    if (!reachable) return { ok: false, error: 'smtpFailed' };
  }
  await db().setting.upsert(
    settingUpsert(
      'mail.smtp',
      {
        enabled: data.enabled,
        host: data.host,
        port: data.port,
        security: data.security,
        user: data.user,
        passwordEncrypted: password
          ? encryptSecret(password, 'setting:mail.smtp.password', keyring)
          : '',
        fromEmail: data.fromEmail,
        fromName: data.fromName,
      },
      actor.id,
    ),
  );
  await audit('settings.mail_updated', {
    actorId: actor.id,
    meta: { enabled: data.enabled, passwordChanged: Boolean(data.password) },
  });
  revalidatePath('/', 'layout');
  return { ok: true };
}
