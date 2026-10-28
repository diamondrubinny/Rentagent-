import 'server-only';
import { evaluateLicense, type LicenseState, VENDOR_PUBLIC_KEYS } from '@rentagent/license';
import { getServerEnv } from '@rentagent/core';
import { getSetting, type SettingValues } from '@rentagent/db';
import { cache } from 'react';
import { db } from './runtime';

export type LicenseSetting = SettingValues['license'];

export const EMPTY_LICENSE: LicenseSetting = {
  token: '',
  activatedAt: null,
  check: { lastAttemptAt: null, lastSuccessAt: null, status: null },
};

export async function getLicenseSetting(): Promise<LicenseSetting> {
  return { ...EMPTY_LICENSE, ...(await getSetting(db(), 'license')) };
}

export function appHost(): string {
  return new URL(getServerEnv().APP_URL).hostname;
}

/** The token in use: entered in the admin area, else LICENSE_KEY from the environment. */
export function effectiveToken(setting: LicenseSetting): { token: string; fromEnv: boolean } {
  if (setting.token) return { token: setting.token, fromEnv: false };
  const fromEnv = getServerEnv().LICENSE_KEY.trim();
  return { token: fromEnv, fromEnv: Boolean(fromEnv) };
}

/**
 * What this installation is licensed for (per request). Licensing is soft: it only
 * affects white-labelling and admin notices — visitors and users are never blocked.
 */
export const getLicenseState = cache(async (): Promise<LicenseState & { fromEnv: boolean }> => {
  const [setting, userCount] = await Promise.all([getLicenseSetting(), db().user.count()]);
  const { token, fromEnv } = effectiveToken(setting);
  const env = getServerEnv();
  return {
    ...evaluateLicense({
      token,
      keys: VENDOR_PUBLIC_KEYS,
      host: appHost(),
      now: new Date(),
      online: Boolean(env.LICENSE_SERVER_URL),
      // A key from the environment counts as activated when first seen by a check.
      activatedAt: setting.activatedAt,
      check: setting.check,
      userCount,
    }),
    fromEnv,
  };
});

export async function whiteLabelAllowed(): Promise<boolean> {
  return (await getLicenseState()).features.includes('white_label');
}
