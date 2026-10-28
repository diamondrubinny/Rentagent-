import type { LedgerType, Prisma, PrismaClient } from '@rentagent/db';
import { microsToMinorCeil } from './amounts';

type Tx = Prisma.TransactionClient;

export class InsufficientCreditsError extends Error {
  constructor() {
    super('insufficient credits');
    this.name = 'InsufficientCreditsError';
  }
}

export interface WalletSnapshot {
  userId: string;
  currency: string;
  balanceMinor: bigint;
  heldMinor: bigint;
}

/**
 * Locks (and creates on first use) the user's wallet row for the rest of the
 * transaction. A new wallet receives the operator's sign-up credit once.
 */
export async function lockWallet(
  tx: Tx,
  userId: string,
  currency: string,
  signupCreditMinor = 0n,
): Promise<WalletSnapshot> {
  const inserted = await tx.$executeRaw`
    INSERT INTO wallets (user_id, currency, balance_minor, held_minor, updated_at)
    VALUES (${userId}, ${currency}, 0, 0, now())
    ON CONFLICT (user_id) DO NOTHING`;
  const rows = await tx.$queryRaw<
    { user_id: string; currency: string; balance_minor: bigint; held_minor: bigint }[]
  >`SELECT user_id, currency, balance_minor, held_minor FROM wallets WHERE user_id = ${userId} FOR UPDATE`;
  const row = rows[0];
  if (!row) throw new Error('wallet missing after insert');
  const wallet = {
    userId,
    currency: row.currency,
    balanceMinor: row.balance_minor,
    heldMinor: row.held_minor,
  };
  if (inserted === 1 && signupCreditMinor > 0n)
    return applyEntry(tx, wallet, {
      type: 'GRANT',
      availableDelta: signupCreditMinor,
      note: 'sign-up credit',
    });
  return wallet;
}

/** Appends a ledger entry and applies it to the (locked) wallet. */
export async function applyEntry(
  tx: Tx,
  wallet: WalletSnapshot,
  entry: {
    type: LedgerType;
    availableDelta: bigint;
    heldDelta?: bigint;
    runId?: string;
    paymentId?: string;
    note?: string;
    actorId?: string;
  },
): Promise<WalletSnapshot> {
  const heldDelta = entry.heldDelta ?? 0n;
  await tx.ledgerEntry.create({
    data: {
      userId: wallet.userId,
      type: entry.type,
      availableDelta: entry.availableDelta,
      heldDelta,
      currency: wallet.currency,
      runId: entry.runId,
      paymentId: entry.paymentId,
      note: entry.note?.slice(0, 300),
      actorId: entry.actorId,
    },
  });
  const updated = await tx.wallet.update({
    where: { userId: wallet.userId },
    data: {
      balanceMinor: { increment: entry.availableDelta },
      heldMinor: { increment: heldDelta },
    },
  });
  return { ...wallet, balanceMinor: updated.balanceMinor, heldMinor: updated.heldMinor };
}

export interface HoldPlan {
  /** Credits to reserve. */
  holdMinor: bigint;
  /** Price limit for usage pricing (micro-units), null for fixed prices. */
  priceLimitMicros: bigint | null;
}

/**
 * Decides how much to reserve for a run. Usage pricing reserves the per-task
 * cap or whatever smaller amount is available; fixed prices need the full price.
 */
export function planHold(
  pricing: { mode: 'free' | 'usage' | 'per_task'; perTaskMinor: bigint; maxPerTaskMinor: bigint },
  available: bigint,
  minorToMicros: (minor: bigint) => bigint,
): HoldPlan | null {
  if (pricing.mode === 'free') return { holdMinor: 0n, priceLimitMicros: null };
  if (pricing.mode === 'per_task')
    return available >= pricing.perTaskMinor && pricing.perTaskMinor > 0n
      ? { holdMinor: pricing.perTaskMinor, priceLimitMicros: null }
      : null;
  if (available <= 0n) return null;
  const hold = available < pricing.maxPerTaskMinor ? available : pricing.maxPerTaskMinor;
  return { holdMinor: hold, priceLimitMicros: minorToMicros(hold) };
}

/** Reserves credits for a run inside the transaction that creates it. */
export async function holdForRun(
  tx: Tx,
  wallet: WalletSnapshot,
  runId: string,
  holdMinor: bigint,
): Promise<WalletSnapshot> {
  if (holdMinor <= 0n) return wallet;
  if (wallet.balanceMinor < holdMinor) throw new InsufficientCreditsError();
  return applyEntry(tx, wallet, {
    type: 'HOLD',
    availableDelta: -holdMinor,
    heldDelta: holdMinor,
    runId,
  });
}

/** How much of a hold is charged when a run ends. */
export function captureAmount(
  run: { holdMinor: bigint; priceMicros: bigint; status: string; fixedPrice: boolean },
  currency: string,
): bigint {
  if (run.holdMinor <= 0n) return 0n;
  if (run.fixedPrice) return run.status === 'SUCCEEDED' ? run.holdMinor : 0n;
  const price = microsToMinorCeil(run.priceMicros, currency);
  return price < run.holdMinor ? price : run.holdMinor;
}

const TERMINAL = ['SUCCEEDED', 'FAILED', 'CANCELED'];

/**
 * Captures the price of a finished run and releases the rest of its hold.
 * Idempotent: only the first call for a run does anything. Runs still in
 * progress are left alone unless `force` (the run is being deleted).
 */
export async function settleRun(
  db: PrismaClient,
  runId: string,
  { force = false }: { force?: boolean } = {},
): Promise<{ chargedMinor: bigint } | null> {
  return db.$transaction(async (tx) => {
    const run = await tx.run.findUnique({
      where: { id: runId },
      select: {
        id: true,
        userId: true,
        status: true,
        holdMinor: true,
        priceMicros: true,
        priceLimitMicros: true,
        settledAt: true,
        agent: { select: { name: true } },
      },
    });
    if (!run || run.settledAt) return null;
    if (!force && !TERMINAL.includes(run.status)) return null;
    // Claim settlement first: a concurrent settle of the same run does nothing.
    const claimed = await tx.run.updateMany({
      where: { id: runId, settledAt: null },
      data: { settledAt: new Date() },
    });
    if (claimed.count === 0 || run.holdMinor <= 0n || !run.userId) return { chargedMinor: 0n };

    const walletRow = await tx.wallet.findUnique({ where: { userId: run.userId } });
    if (!walletRow) return { chargedMinor: 0n };
    let wallet = await lockWallet(tx, run.userId, walletRow.currency);
    const charged = captureAmount(
      {
        holdMinor: run.holdMinor,
        priceMicros: run.priceMicros,
        status: force && !TERMINAL.includes(run.status) ? 'CANCELED' : run.status,
        fixedPrice: run.priceLimitMicros === null,
      },
      wallet.currency,
    );
    if (charged > 0n)
      wallet = await applyEntry(tx, wallet, {
        type: 'CAPTURE',
        availableDelta: 0n,
        heldDelta: -charged,
        runId,
        // The history keeps saying what was paid for after the chat is deleted.
        note: run.agent.name,
      });
    const released = run.holdMinor - charged;
    if (released > 0n)
      await applyEntry(tx, wallet, {
        type: 'RELEASE',
        availableDelta: released,
        heldDelta: -released,
        runId,
      });
    await tx.run.update({ where: { id: runId }, data: { chargedMinor: charged } });
    return { chargedMinor: charged };
  });
}

/** Settles finished runs that were missed (e.g. a worker crash between finishing and settling). */
export async function settleOrphanRuns(db: PrismaClient, limit = 200): Promise<number> {
  const runs = await db.run.findMany({
    where: {
      settledAt: null,
      holdMinor: { gt: 0n },
      status: { in: ['SUCCEEDED', 'FAILED', 'CANCELED'] },
    },
    select: { id: true },
    take: limit,
  });
  for (const run of runs) await settleRun(db, run.id);
  return runs.length;
}

/** Settles (force) every run of the given selection before rows are deleted. */
export async function settleBeforeDelete(db: PrismaClient, runIds: string[]): Promise<void> {
  for (const id of runIds) await settleRun(db, id, { force: true });
}
