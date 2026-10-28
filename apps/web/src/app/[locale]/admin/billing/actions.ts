'use server';

import {
  applyEntry,
  lockWallet,
  syncPlanToStripe,
  testPayPal,
  testStripe,
} from '@rentagent/billing';
import { encryptSecret } from '@rentagent/core';
import { getSetting, settingUpsert } from '@rentagent/db';
import { toMinorUnits } from '@rentagent/shared';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { authorizeAction } from '@/lib/server/admin-action';
import { audit } from '@/lib/server/audit';
import { getBillingConfig } from '@/lib/server/billing';
import { db, encryptionKeyring } from '@/lib/server/runtime';

export type BillingActionResult =
  { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

const forbidden = { ok: false, error: 'forbidden' } as const;
const amount = z
  .string()
  .trim()
  .regex(/^\d{1,7}(?:\.\d{1,2})?$/, { error: 'invalidDecimal' });

function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) errors[String(issue.path[0] ?? 'form')] ??= issue.message;
  return errors;
}

const settingsSchema = z
  .object({
    enabled: z.boolean(),
    packs: z.array(amount).min(1, { error: 'required' }).max(6, { error: 'tooLong' }),
    customMin: amount,
    customMax: amount,
    signupCredit: amount,
  })
  .refine(
    (value) => Number(value.customMin) > 0 && Number(value.customMin) <= Number(value.customMax),
    {
      path: ['customMax'],
      error: 'invalidValue',
    },
  )
  .refine((value) => value.packs.every((pack) => Number(pack) > 0), {
    path: ['packs'],
    error: 'invalidDecimal',
  });

export async function saveBillingSettings(input: {
  enabled: boolean;
  packs: string;
  customMin: string;
  customMax: string;
  signupCredit: string;
}): Promise<BillingActionResult> {
  const actor = await authorizeAction('billing.manage');
  if (!actor) return forbidden;
  const parsed = settingsSchema.safeParse({
    ...input,
    packs: String(input.packs ?? '')
      .split(/[\s,;]+/)
      .filter(Boolean),
  });
  if (!parsed.success)
    return { ok: false, error: 'invalid', fieldErrors: fieldErrorsOf(parsed.error) };
  const { currency } = await getBillingConfig();
  // Every amount must fit the currency's precision (e.g. no decimals for JPY).
  for (const [field, value] of [
    ['customMin', parsed.data.customMin],
    ['customMax', parsed.data.customMax],
    ['signupCredit', parsed.data.signupCredit],
    ...parsed.data.packs.map((pack) => ['packs', pack] as const),
  ] as const) {
    try {
      toMinorUnits(value, currency);
    } catch {
      return { ok: false, error: 'invalid', fieldErrors: { [field]: 'invalidDecimal' } };
    }
  }
  await db().setting.upsert(settingUpsert('billing.settings', parsed.data, actor.id));
  await audit('billing.settings_updated', {
    actorId: actor.id,
    meta: { enabled: parsed.data.enabled },
  });
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Saves Stripe keys; empty secret fields keep the stored value. */
export async function saveStripeSettings(input: {
  enabled: boolean;
  secretKey: string;
  webhookSecret: string;
  automaticTax: boolean;
}): Promise<BillingActionResult> {
  const actor = await authorizeAction('billing.manage');
  if (!actor) return forbidden;
  const current = await getSetting(db(), 'billing.stripe');
  const secretKey = String(input.secretKey ?? '').trim();
  const webhookSecret = String(input.webhookSecret ?? '').trim();
  if (secretKey && !/^(sk|rk)_(test|live)_[A-Za-z0-9]{10,}$/.test(secretKey))
    return { ok: false, error: 'invalid', fieldErrors: { secretKey: 'invalidValue' } };
  if (webhookSecret && !/^whsec_[A-Za-z0-9]{10,}$/.test(webhookSecret))
    return { ok: false, error: 'invalid', fieldErrors: { webhookSecret: 'invalidValue' } };
  const keyring = encryptionKeyring();
  const next = {
    enabled: input.enabled === true,
    secretKeyEncrypted: secretKey
      ? encryptSecret(secretKey, 'setting:billing.stripe.secretKey', keyring)
      : (current?.secretKeyEncrypted ?? ''),
    webhookSecretEncrypted: webhookSecret
      ? encryptSecret(webhookSecret, 'setting:billing.stripe.webhookSecret', keyring)
      : (current?.webhookSecretEncrypted ?? ''),
    automaticTax: input.automaticTax === true,
  };
  if (next.enabled && (!next.secretKeyEncrypted || !next.webhookSecretEncrypted))
    return { ok: false, error: 'keysRequired' };
  await db().setting.upsert(settingUpsert('billing.stripe', next, actor.id));
  if (next.enabled) {
    const config = await getBillingConfig();
    if (config.stripe && !(await testStripe(config.stripe))) {
      await audit('billing.gateway_updated', {
        actorId: actor.id,
        meta: { gateway: 'stripe', test: false },
      });
      return { ok: false, error: 'connectionFailed' };
    }
  }
  await audit('billing.gateway_updated', {
    actorId: actor.id,
    meta: { gateway: 'stripe', enabled: next.enabled },
  });
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function savePayPalSettings(input: {
  enabled: boolean;
  mode: string;
  clientId: string;
  clientSecret: string;
  webhookId: string;
}): Promise<BillingActionResult> {
  const actor = await authorizeAction('billing.manage');
  if (!actor) return forbidden;
  const current = await getSetting(db(), 'billing.paypal');
  const mode = input.mode === 'live' ? 'live' : 'sandbox';
  const clientId = String(input.clientId ?? '').trim();
  const clientSecret = String(input.clientSecret ?? '').trim();
  const webhookId = String(input.webhookId ?? '').trim();
  if (clientId && !/^[A-Za-z0-9_-]{10,200}$/.test(clientId))
    return { ok: false, error: 'invalid', fieldErrors: { clientId: 'invalidValue' } };
  if (webhookId && !/^[A-Za-z0-9_-]{5,100}$/.test(webhookId))
    return { ok: false, error: 'invalid', fieldErrors: { webhookId: 'invalidValue' } };
  const next = {
    enabled: input.enabled === true,
    mode: mode as 'live' | 'sandbox',
    clientId: clientId || (current?.clientId ?? ''),
    clientSecretEncrypted: clientSecret
      ? encryptSecret(clientSecret, 'setting:billing.paypal.clientSecret', encryptionKeyring())
      : (current?.clientSecretEncrypted ?? ''),
    webhookId: webhookId || (current?.webhookId ?? ''),
  };
  if (next.enabled && (!next.clientId || !next.clientSecretEncrypted || !next.webhookId))
    return { ok: false, error: 'keysRequired' };
  await db().setting.upsert(settingUpsert('billing.paypal', next, actor.id));
  if (next.enabled) {
    const config = await getBillingConfig();
    if (config.paypal && !(await testPayPal(config.paypal)))
      return { ok: false, error: 'connectionFailed' };
  }
  await audit('billing.gateway_updated', {
    actorId: actor.id,
    meta: { gateway: 'paypal', enabled: next.enabled, mode },
  });
  revalidatePath('/', 'layout');
  return { ok: true };
}

const adjustSchema = z.object({
  email: z.email({ error: 'invalidEmail' }).max(254),
  amount: z
    .string()
    .trim()
    .regex(/^-?\d{1,7}(?:\.\d{1,2})?$/, { error: 'invalidDecimal' })
    .refine((value) => Number(value) !== 0, { error: 'invalidDecimal' }),
  reason: z.string().trim().min(3, { error: 'required' }).max(200, { error: 'tooLong' }),
});

/** Manual credit correction with a mandatory reason (audited, appears in the user's history). */
export async function adjustWallet(input: {
  email: string;
  amount: string;
  reason: string;
}): Promise<BillingActionResult> {
  const actor = await authorizeAction('billing.manage');
  if (!actor) return forbidden;
  const parsed = adjustSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: 'invalid', fieldErrors: fieldErrorsOf(parsed.error) };
  const { currency } = await getBillingConfig();
  const negative = parsed.data.amount.startsWith('-');
  let minor: bigint;
  try {
    minor = toMinorUnits(parsed.data.amount.replace(/^-/, ''), currency);
  } catch {
    return { ok: false, error: 'invalid', fieldErrors: { amount: 'invalidDecimal' } };
  }
  const target = await db().user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
    select: { id: true },
  });
  if (!target) return { ok: false, error: 'invalid', fieldErrors: { email: 'unknownUser' } };
  await db().$transaction(async (tx) => {
    const wallet = await lockWallet(tx, target.id, currency);
    await applyEntry(tx, wallet, {
      type: 'ADJUST',
      availableDelta: negative ? -minor : minor,
      note: parsed.data.reason,
      actorId: actor.id,
    });
  });
  await audit('billing.wallet_adjusted', {
    actorId: actor.id,
    target: `user:${target.id}`,
    meta: { amountMinor: (negative ? -minor : minor).toString(), currency },
  });
  revalidatePath('/[locale]/admin', 'layout');
  return { ok: true };
}

const planSchema = z.object({
  id: z.uuid().nullable(),
  name: z.string().trim().min(1, { error: 'required' }).max(80, { error: 'tooLong' }),
  description: z.string().trim().max(300, { error: 'tooLong' }),
  price: amount,
  credits: amount,
  interval: z.enum(['MONTH', 'YEAR']),
  active: z.boolean(),
});

/** Creates or updates a plan and keeps its Stripe product/price in sync. */
export async function savePlan(input: {
  id: string | null;
  name: string;
  description: string;
  price: string;
  credits: string;
  interval: string;
  active: boolean;
}): Promise<BillingActionResult> {
  const actor = await authorizeAction('billing.manage');
  if (!actor) return forbidden;
  const parsed = planSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: 'invalid', fieldErrors: fieldErrorsOf(parsed.error) };
  const billing = await getBillingConfig();
  let priceMinor: bigint;
  let creditsMinor: bigint;
  try {
    priceMinor = toMinorUnits(parsed.data.price, billing.currency);
    creditsMinor = toMinorUnits(parsed.data.credits, billing.currency);
  } catch {
    return { ok: false, error: 'invalid', fieldErrors: { price: 'invalidDecimal' } };
  }
  if (priceMinor <= 0n)
    return { ok: false, error: 'invalid', fieldErrors: { price: 'invalidDecimal' } };
  const data = {
    name: parsed.data.name,
    description: parsed.data.description,
    priceMinor,
    creditsMinor,
    currency: billing.currency,
    interval: parsed.data.interval,
    active: parsed.data.active,
  };
  const plan = parsed.data.id
    ? await db()
        .plan.update({ where: { id: parsed.data.id }, data })
        .catch(() => null)
    : await db().plan.create({ data });
  if (!plan) return { ok: false, error: 'notFound' };
  if (billing.stripe) {
    try {
      const ids = await syncPlanToStripe(billing.stripe, plan);
      await db().plan.update({
        where: { id: plan.id },
        data: { stripeProductId: ids.productId, stripePriceId: ids.priceId },
      });
    } catch {
      await audit('billing.plan_saved', {
        actorId: actor.id,
        target: `plan:${plan.id}`,
        meta: { stripe: false },
      });
      revalidatePath('/', 'layout');
      return { ok: false, error: 'stripeSyncFailed' };
    }
  }
  await audit('billing.plan_saved', { actorId: actor.id, target: `plan:${plan.id}` });
  revalidatePath('/', 'layout');
  return { ok: true };
}
