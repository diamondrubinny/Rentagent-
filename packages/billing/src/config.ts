import { decryptSecret, type Keyring } from '@rentagent/core';
import { getSettings, type PrismaClient, type SettingValues } from '@rentagent/db';
import type { PayPalConnection } from './paypal';
import type { StripeConnection } from './stripe';

export type BillingSettings = SettingValues['billing.settings'];

export const DEFAULT_BILLING_SETTINGS: BillingSettings = {
  enabled: false,
  packs: ['10', '25', '50'],
  customMin: '5',
  customMax: '500',
  signupCredit: '0',
};

export interface BillingConfig {
  settings: BillingSettings;
  /** Installation base currency (ISO 4217), fixed at setup. */
  currency: string;
  stripe: (StripeConnection & { webhookSecret: string; automaticTax: boolean }) | null;
  paypal: (PayPalConnection & { webhookId: string }) | null;
}

/** Billing settings with gateway secrets decrypted (server-side only, never sent to browsers). */
export async function loadBillingConfig(
  db: PrismaClient,
  keyring: Keyring,
): Promise<BillingConfig> {
  const values = await getSettings(db, [
    'billing.settings',
    'billing.stripe',
    'billing.paypal',
    'billing.baseCurrency',
  ] as const);
  const stripe = values['billing.stripe'];
  const paypal = values['billing.paypal'];
  return {
    settings: { ...DEFAULT_BILLING_SETTINGS, ...values['billing.settings'] },
    currency: values['billing.baseCurrency'] ?? 'USD',
    stripe:
      stripe?.enabled && stripe.secretKeyEncrypted
        ? {
            secretKey: decryptSecret(
              stripe.secretKeyEncrypted,
              'setting:billing.stripe.secretKey',
              keyring,
            ),
            webhookSecret: stripe.webhookSecretEncrypted
              ? decryptSecret(
                  stripe.webhookSecretEncrypted,
                  'setting:billing.stripe.webhookSecret',
                  keyring,
                )
              : '',
            automaticTax: stripe.automaticTax,
          }
        : null,
    paypal:
      paypal?.enabled && paypal.clientSecretEncrypted
        ? {
            mode: paypal.mode,
            clientId: paypal.clientId,
            clientSecret: decryptSecret(
              paypal.clientSecretEncrypted,
              'setting:billing.paypal.clientSecret',
              keyring,
            ),
            webhookId: paypal.webhookId,
          }
        : null,
  };
}
