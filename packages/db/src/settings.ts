import type { PrismaClient } from './generated/prisma/client';

/**
 * Typed registry of installation settings. Adding a key here is the only way to
 * read or write it, which keeps settings discoverable and validated.
 */
export interface SettingValues {
  'site.name': string;
  'site.defaultLocale': string;
  'site.timeZone': string;
  'billing.baseCurrency': string;
  'license.key': string; // encrypted
  'mail.smtp': {
    enabled: boolean;
    host: string;
    port: number;
    security: 'tls' | 'starttls' | 'none';
    user: string;
    passwordEncrypted: string;
    fromEmail: string;
    fromName: string;
  };
  'privacy.optionalTrackersEnabled': boolean;
  'setup.completedAt': string; // ISO timestamp
}

export type SettingKey = keyof SettingValues;

export async function getSetting<K extends SettingKey>(
  db: PrismaClient,
  key: K,
): Promise<SettingValues[K] | undefined> {
  const row = await db.setting.findUnique({ where: { key } });
  return row?.value as SettingValues[K] | undefined;
}

export async function getSettings<K extends SettingKey>(
  db: PrismaClient,
  keys: readonly K[],
): Promise<Partial<Pick<SettingValues, K>>> {
  const rows = await db.setting.findMany({ where: { key: { in: [...keys] } } });
  return Object.fromEntries(rows.map((row) => [row.key, row.value])) as Partial<
    Pick<SettingValues, K>
  >;
}

export function settingUpsert<K extends SettingKey>(
  key: K,
  value: SettingValues[K],
  updatedBy?: string,
) {
  return {
    where: { key },
    create: { key, value: value as never, updatedBy },
    update: { value: value as never, updatedBy },
  };
}
