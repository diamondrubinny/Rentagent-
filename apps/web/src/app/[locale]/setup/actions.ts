'use server';

import { encryptSecret, getServerEnv, rateLimit, safeEqual } from '@rentagent/core';
import { settingUpsert, TextDirection } from '@rentagent/db';
import {
  BUILTIN_LOCALES,
  getLocaleNativeName,
  getTextDirection,
  setupSchema,
} from '@rentagent/shared';
import { audit } from '@/lib/server/audit';
import { verifySmtp } from '@/lib/server/mail';
import { clientIpHash, db, encryptionKeyring, logger, redis } from '@/lib/server/runtime';
import { getSiteConfig } from '@/lib/server/site';
import { revalidatePath } from 'next/cache';
import { redirect } from '@/i18n/navigation';
import type { SetupFormState } from './state';

const SECRET_FIELDS = new Set(['token', 'smtpPassword']);
const SETUP_LOCK_ID = 7_420_001; // arbitrary constant for pg_advisory_xact_lock

class SetupAlreadyCompleteError extends Error {}

function publicValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string' && !SECRET_FIELDS.has(key) && !key.startsWith('$')) {
      values[key] = value;
    }
  }
  return values;
}

export async function completeSetup(
  _previous: SetupFormState,
  formData: FormData,
): Promise<SetupFormState> {
  const values = publicValues(formData);
  const fail = (formError: SetupFormState['formError'], fieldErrors?: Record<string, string>) => ({
    status: 'error' as const,
    formError,
    fieldErrors,
    values,
  });

  // Brute-force protection for the setup token: 5 attempts per 15 minutes per client.
  const limit = await rateLimit(redis(), `setup:${await clientIpHash()}`, 5, 15 * 60);
  if (!limit.allowed) return fail('rateLimited');

  if ((await getSiteConfig()).setupComplete) return fail('alreadyComplete');

  const parsed = setupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? 'form');
      fieldErrors[field] ??= issue.message;
    }
    return fail(undefined, fieldErrors);
  }
  const data = parsed.data;

  if (!safeEqual(data.token, getServerEnv().SETUP_TOKEN)) {
    await audit('setup.token_invalid');
    return fail(undefined, { token: 'invalidToken' });
  }

  if (data.smtpEnabled) {
    const reachable = await verifySmtp({
      host: data.smtpHost,
      port: data.smtpPort,
      security: data.smtpSecurity,
      user: data.smtpUser,
      password: data.smtpPassword,
    });
    if (!reachable) return fail('smtpFailed');
  }

  const keyring = encryptionKeyring();
  try {
    await db().$transaction(async (tx) => {
      // Serializes concurrent submissions so setup can only complete once.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SETUP_LOCK_ID})`;
      const existing = await tx.setting.findUnique({ where: { key: 'setup.completedAt' } });
      if (existing) throw new SetupAlreadyCompleteError();

      await tx.setting.upsert(settingUpsert('site.name', data.siteName, 'setup'));
      await tx.setting.upsert(settingUpsert('site.defaultLocale', data.defaultLocale, 'setup'));
      await tx.setting.upsert(settingUpsert('site.timeZone', data.timeZone, 'setup'));
      await tx.setting.upsert(settingUpsert('billing.baseCurrency', data.baseCurrency, 'setup'));
      await tx.setting.upsert(settingUpsert('privacy.optionalTrackersEnabled', false, 'setup'));
      if (data.licenseKey) {
        await tx.setting.upsert(
          settingUpsert(
            'license.key',
            encryptSecret(data.licenseKey, 'setting:license.key', keyring),
            'setup',
          ),
        );
      }
      await tx.setting.upsert(
        settingUpsert(
          'mail.smtp',
          {
            enabled: data.smtpEnabled,
            host: data.smtpHost,
            port: data.smtpPort,
            security: data.smtpSecurity,
            user: data.smtpUser,
            passwordEncrypted: data.smtpPassword
              ? encryptSecret(data.smtpPassword, 'setting:mail.smtp.password', keyring)
              : '',
            fromEmail: data.smtpFromEmail,
            fromName: data.smtpFromName || data.siteName,
          },
          'setup',
        ),
      );

      for (const code of BUILTIN_LOCALES) {
        const locale = {
          nativeName: getLocaleNativeName(code),
          direction: getTextDirection(code) === 'rtl' ? TextDirection.RTL : TextDirection.LTR,
          enabled: true,
          isDefault: code === data.defaultLocale,
          builtin: true,
        };
        await tx.locale.upsert({ where: { code }, create: { code, ...locale }, update: locale });
      }

      await tx.setting.upsert(
        settingUpsert('setup.completedAt', new Date().toISOString(), 'setup'),
      );
    });
  } catch (error) {
    if (error instanceof SetupAlreadyCompleteError) return fail('alreadyComplete');
    logger().error({ err: error }, 'setup failed');
    return fail('generic');
  }

  await audit('setup.completed', {
    meta: {
      defaultLocale: data.defaultLocale,
      currency: data.baseCurrency,
      smtp: data.smtpEnabled,
    },
  });
  // The site name and setup state are rendered in the shared layout.
  revalidatePath('/', 'layout');
  redirect({ href: { pathname: '/', query: { setup: 'done' } }, locale: data.defaultLocale });
  return { status: 'idle' };
}
