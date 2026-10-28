import type { PaymentGateway, PrismaClient } from '@rentagent/db';
import { applyEntry, lockWallet } from './wallet';

export type CompletionResult = 'credited' | 'already' | 'unknown' | 'mismatch';

/**
 * Marks a pending top-up as paid and credits the wallet — exactly once per
 * gateway reference. The amount and currency reported by the gateway must
 * match what this system asked for; otherwise nothing is credited.
 */
export async function completePayment(
  db: PrismaClient,
  gateway: PaymentGateway,
  gatewayRef: string,
  paid: {
    amountMinor: bigint;
    currency: string;
    chargeRef?: string | null;
    taxMinor?: bigint;
    receiptUrl?: string | null;
  },
): Promise<CompletionResult> {
  return db.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { gateway_gatewayRef: { gateway, gatewayRef } },
    });
    if (!payment?.userId) return 'unknown';
    if (payment.status === 'SUCCEEDED') return 'already';
    if (
      payment.amountMinor !== paid.amountMinor ||
      payment.currency !== paid.currency.toUpperCase()
    )
      return 'mismatch';
    const claimed = await tx.payment.updateMany({
      where: { id: payment.id, status: 'PENDING' },
      data: {
        status: 'SUCCEEDED',
        chargeRef: paid.chargeRef ?? undefined,
        taxMinor: paid.taxMinor ?? 0n,
        receiptUrl: paid.receiptUrl ?? undefined,
      },
    });
    if (claimed.count === 0) return 'already';
    const wallet = await lockWallet(tx, payment.userId, payment.currency);
    await applyEntry(tx, wallet, {
      type: 'TOPUP',
      availableDelta: payment.amountMinor,
      paymentId: payment.id,
    });
    return 'credited';
  });
}

/**
 * Applies a refund reported by the gateway as the new total refunded amount;
 * only the difference to what was already refunded is deducted (idempotent).
 * The balance may go below zero, which blocks new paid tasks.
 */
export async function applyRefund(
  db: PrismaClient,
  gateway: PaymentGateway,
  chargeRef: string,
  refundedTotalMinor: bigint,
): Promise<bigint> {
  return db.$transaction(async (tx) => {
    const payment = await tx.payment.findFirst({ where: { gateway, chargeRef } });
    if (!payment?.userId || payment.status !== 'SUCCEEDED') return 0n;
    const total =
      refundedTotalMinor > payment.amountMinor ? payment.amountMinor : refundedTotalMinor;
    const delta = total - payment.refundedMinor;
    if (delta <= 0n) return 0n;
    const claimed = await tx.payment.updateMany({
      where: { id: payment.id, refundedMinor: payment.refundedMinor },
      data: { refundedMinor: total },
    });
    if (claimed.count === 0) return 0n;
    const wallet = await lockWallet(tx, payment.userId, payment.currency);
    await applyEntry(tx, wallet, {
      type: 'REFUND',
      availableDelta: -delta,
      paymentId: payment.id,
    });
    return delta;
  });
}

/**
 * Applies one refund identified by the gateway's refund id (PayPal reports each
 * refund separately). Re-delivery of the same refund changes nothing.
 */
export async function applyRefundById(
  db: PrismaClient,
  gateway: PaymentGateway,
  chargeRef: string,
  refundId: string,
  amountMinor: bigint,
): Promise<bigint> {
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM payments WHERE gateway = ${gateway}::"PaymentGateway" AND charge_ref = ${chargeRef} FOR UPDATE`;
    const payment = rows[0] ? await tx.payment.findUnique({ where: { id: rows[0].id } }) : null;
    if (!payment?.userId || payment.status !== 'SUCCEEDED') return 0n;
    const marker = `refund:${refundId}`.slice(0, 300);
    if (
      await tx.ledgerEntry.findFirst({
        where: { paymentId: payment.id, type: 'REFUND', note: marker },
      })
    )
      return 0n;
    const remaining = payment.amountMinor - payment.refundedMinor;
    const delta = amountMinor < remaining ? amountMinor : remaining;
    if (delta <= 0n) return 0n;
    await tx.payment.update({
      where: { id: payment.id },
      data: { refundedMinor: { increment: delta } },
    });
    const wallet = await lockWallet(tx, payment.userId, payment.currency);
    await applyEntry(tx, wallet, {
      type: 'REFUND',
      availableDelta: -delta,
      paymentId: payment.id,
      note: marker,
    });
    return delta;
  });
}
