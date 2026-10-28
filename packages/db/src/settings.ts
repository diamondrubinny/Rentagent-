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
  'auth.registrationMode': 'open' | 'closed';
  /** Global AI kill switch: when true, no provider calls are made. */
  'ai.disabled': boolean;
  /** AiModel.id (kind EMBEDDING) used for knowledge bases. */
  'ai.embeddingModelId': string;
  /** Whether visitors can browse the agent catalog without signing in. */
  'agents.catalogPublic': boolean;
  /** Live runs (turns) per user per day; 0 = unlimited. Credits replace this in billing. */
  'agents.userDailyRunLimit': number;
  /** Conversations and runs untouched for this many days are deleted; 0 = keep. */
  'privacy.runRetentionDays': number;
  'billing.settings': {
    enabled: boolean;
    /** Decimal amounts in the base currency, e.g. ["10", "25", "50"]. */
    packs: string[];
    customMin: string;
    customMax: string;
    /** Free credits for each new wallet ("0" = none). */
    signupCredit: string;
  };
  'billing.stripe': {
    enabled: boolean;
    secretKeyEncrypted: string;
    webhookSecretEncrypted: string;
    /** Requires Stripe Tax to be set up in the Stripe account. */
    automaticTax: boolean;
  };
  'billing.paypal': {
    enabled: boolean;
    mode: 'sandbox' | 'live';
    clientId: string;
    clientSecretEncrypted: string;
    webhookId: string;
  };
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
