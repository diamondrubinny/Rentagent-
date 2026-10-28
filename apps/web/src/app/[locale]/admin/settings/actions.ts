'use server';

import { settingUpsert } from '@rentagent/db';
import { nameField, REGISTRATION_MODES } from '@rentagent/shared';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { type ActionResult, authorizeAction } from '@/lib/server/admin-action';
import { audit } from '@/lib/server/audit';
import { resetAuth } from '@/lib/server/auth';
import { db } from '@/lib/server/runtime';
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
