import { getSetting, type PrismaClient, settingUpsert } from '@rentagent/db';
import { runLicenseCheck, VENDOR_PUBLIC_KEYS } from '@rentagent/license';
import type { Logger } from 'pino';

const EMPTY_CHECK = { lastAttemptAt: null, lastSuccessAt: null, status: null };

/**
 * Daily online license check (only when LICENSE_SERVER_URL is set). Sends the
 * license id, the domain and the version; the result only affects white-labelling
 * and admin notices.
 */
export async function checkLicense(
  deps: { db: PrismaClient; log: Logger },
  env: {
    APP_URL: string;
    LICENSE_KEY: string;
    LICENSE_SERVER_URL: string;
    RENTAGENT_VERSION: string;
  },
): Promise<void> {
  if (!env.LICENSE_SERVER_URL) return;
  const stored = await getSetting(deps.db, 'license');
  const token = stored?.token || env.LICENSE_KEY.trim();
  if (!token) return;
  const check = await runLicenseCheck({
    serverUrl: env.LICENSE_SERVER_URL,
    token,
    host: new URL(env.APP_URL).hostname,
    version: env.RENTAGENT_VERSION,
    keys: VENDOR_PUBLIC_KEYS,
    previous: stored?.check ?? EMPTY_CHECK,
  });
  // The operator may have replaced the license while the request was running.
  const fresh = await getSetting(deps.db, 'license');
  if ((fresh?.token ?? '') !== (stored?.token ?? '')) return;
  await deps.db.setting.upsert(
    settingUpsert('license', {
      token: stored?.token ?? '',
      activatedAt: stored?.activatedAt ?? check.lastAttemptAt,
      check,
    }),
  );
  if (check.lastSuccessAt !== check.lastAttemptAt)
    deps.log.warn('license server could not be reached or gave no valid answer');
  else if (check.status !== 'valid')
    deps.log.warn({ status: check.status }, 'license not confirmed');
}
