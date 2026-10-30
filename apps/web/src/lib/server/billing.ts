import 'server-only';
import {
  type BillingConfig,
  decimalToMinor,
  InsufficientCreditsError,
  loadBillingConfig,
  reserveRunCredits,
  type RunBilling,
} from '@rentagent/billing';
import type { Prisma } from '@rentagent/db';
import { type AgentConfig, formatMoney } from '@rentagent/shared';
import { cache } from 'react';
import { emitEvent } from './events';
import { db, encryptionKeyring } from './runtime';

export { InsufficientCreditsError };

/** Billing configuration with decrypted gateway secrets; cached per request. */
export const getBillingConfig = cache((): Promise<BillingConfig> =>
  loadBillingConfig(db(), encryptionKeyring()),
);

/** Reserves credits for a live run inside the transaction that creates it. */
export async function reserveCredits(
  tx: Prisma.TransactionClient,
  userId: string,
  config: AgentConfig,
  runId: string,
): Promise<RunBilling> {
  return reserveRunCredits(tx, await getBillingConfig(), userId, config.pricing, runId);
}

/** Formatted spendable balance for the header, or null when billing is off. */
export async function walletBalanceLabel(userId: string, locale: string): Promise<string | null> {
  const billing = await getBillingConfig();
  if (!billing.settings.enabled) return null;
  const wallet = await db().wallet.findUnique({
    where: { userId },
    select: { balanceMinor: true },
  });
  const balance =
    wallet?.balanceMinor ?? decimalToMinor(billing.settings.signupCredit || '0', billing.currency);
  return formatMoney(balance, billing.currency, locale);
}

/** Price shown to users before they start a task, or null when the agent is free here. */
export async function agentPriceLabel(
  config: AgentConfig,
): Promise<{ mode: 'usage' | 'per_task'; amountMinor: bigint; currency: string } | null> {
  const billing = await getBillingConfig();
  if (!billing.settings.enabled || config.pricing.mode === 'free') return null;
  const decimal =
    config.pricing.mode === 'per_task' ? config.pricing.perTask : config.pricing.maxPerTask;
  if (!decimal) return null;
  return {
    mode: config.pricing.mode,
    amountMinor: decimalToMinor(decimal, billing.currency),
    currency: billing.currency,
  };
}

/** Admin overview: last 30 days of money movements and unused credits. */
export async function billingOverview() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [revenue, refunds, wallets, charged, payments] = await Promise.all([
    db().payment.aggregate({
      where: { status: 'SUCCEEDED', createdAt: { gte: since } },
      _sum: { amountMinor: true },
    }),
    db().payment.aggregate({ where: { createdAt: { gte: since } }, _sum: { refundedMinor: true } }),
    db().wallet.aggregate({ _sum: { balanceMinor: true, heldMinor: true } }),
    db().run.aggregate({ where: { createdAt: { gte: since } }, _sum: { chargedMinor: true } }),
    db().payment.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }),
  ]);
  return {
    revenue: revenue._sum.amountMinor ?? 0n,
    refunds: refunds._sum.refundedMinor ?? 0n,
    charged: charged._sum.chargedMinor ?? 0n,
    outstanding: (wallets._sum.balanceMinor ?? 0n) + (wallets._sum.heldMinor ?? 0n),
    payments,
  };
}

/** Notifies webhooks about a payment (amounts as strings: JSON has no BigInt). */
export async function emitPaymentEvent(
  event: 'payment.succeeded' | 'payment.refunded',
  payment: {
    id: string;
    userId: string | null;
    gateway: string;
    amountMinor: bigint;
    currency: string;
    refundedMinor: bigint;
  },
): Promise<void> {
  const base = {
    paymentId: payment.id,
    userId: payment.userId,
    gateway: payment.gateway.toLowerCase(),
    amountMinor: payment.amountMinor.toString(),
    currency: payment.currency,
  };
  if (event === 'payment.refunded')
    await emitEvent('payment.refunded', {
      ...base,
      refundedMinor: payment.refundedMinor.toString(),
    });
  else await emitEvent('payment.succeeded', base);
}
