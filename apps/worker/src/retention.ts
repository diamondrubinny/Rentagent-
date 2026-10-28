import type { PrismaClient } from '@rentagent/db';
import type { Logger } from 'pino';

const DAY_MS = 86_400_000;

/**
 * How long operational records are kept. Conversations follow the operator's
 * retention setting (purgeExpired); these limits cover the rest.
 */
export const RECORD_RETENTION_DAYS = {
  /** Security audit trail (actor id, action, IP hash). */
  auditLog: 365,
  /** Proof of cookie choices; consent itself is asked again after 6 months. */
  consent: 395,
  /** Webhook delivery attempts (payload summaries, response codes). */
  webhookDeliveries: 30,
  /** AI usage records keep costs for reporting, but lose the link to the user. */
  usageUserLink: 395,
} as const;

/** Deletes expired sign-in data and old operational records. Returns counts per kind. */
export async function purgeRecords(
  deps: { db: PrismaClient; log: Logger },
  now = new Date(),
): Promise<Record<string, number>> {
  const { db } = deps;
  const before = (days: number) => new Date(now.getTime() - days * DAY_MS);
  const results = await Promise.all([
    db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.verification.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.auditLog.deleteMany({
      where: { createdAt: { lt: before(RECORD_RETENTION_DAYS.auditLog) } },
    }),
    db.consentRecord.deleteMany({
      where: { createdAt: { lt: before(RECORD_RETENTION_DAYS.consent) } },
    }),
    db.webhookDelivery.deleteMany({
      where: {
        createdAt: { lt: before(RECORD_RETENTION_DAYS.webhookDeliveries) },
        status: { not: 'PENDING' },
      },
    }),
    db.usageRecord.updateMany({
      where: {
        createdAt: { lt: before(RECORD_RETENTION_DAYS.usageUserLink) },
        userId: { not: null },
      },
      data: { userId: null },
    }),
  ]);
  const [sessions, verifications, auditLogs, consents, deliveries, usage] = results.map(
    (result) => result.count,
  );
  const counts = {
    sessions: sessions!,
    verifications: verifications!,
    auditLogs: auditLogs!,
    consents: consents!,
    deliveries: deliveries!,
    usage: usage!,
  };
  if (Object.values(counts).some(Boolean)) deps.log.info(counts, 'records purged');
  return counts;
}
