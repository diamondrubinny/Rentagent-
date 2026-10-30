import type { Prisma } from '@rentagent/db';
import type { AgentConfig } from '@rentagent/shared';
import { decimalToMinor, minorToMicros } from './amounts';
import type { BillingConfig } from './config';
import { holdForRun, InsufficientCreditsError, lockWallet, planHold } from './wallet';

export interface RunBilling {
  holdMinor: bigint;
  priceLimitMicros: bigint | null;
}

const FREE: RunBilling = { holdMinor: 0n, priceLimitMicros: null };

/**
 * Reserves credits for a live run inside the transaction that creates it (web app,
 * API, widget and scheduled runs all use this). Throws InsufficientCreditsError when
 * the wallet cannot cover the hold.
 */
export async function reserveRunCredits(
  tx: Prisma.TransactionClient,
  billing: BillingConfig,
  userId: string,
  pricing: AgentConfig['pricing'],
  runId: string,
): Promise<RunBilling> {
  if (!billing.settings.enabled || pricing.mode === 'free') return FREE;
  const { currency } = billing;
  const wallet = await lockWallet(
    tx,
    userId,
    currency,
    decimalToMinor(billing.settings.signupCredit || '0', currency),
  );
  const plan = planHold(
    {
      mode: pricing.mode,
      perTaskMinor: pricing.perTask ? decimalToMinor(pricing.perTask, currency) : 0n,
      maxPerTaskMinor: pricing.maxPerTask ? decimalToMinor(pricing.maxPerTask, currency) : 0n,
    },
    wallet.balanceMinor,
    (minor) => minorToMicros(minor, currency),
  );
  if (!plan) throw new InsufficientCreditsError();
  await holdForRun(tx, wallet, runId, plan.holdMinor);
  return plan;
}
