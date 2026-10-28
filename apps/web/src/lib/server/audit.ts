import 'server-only';
import type { Prisma } from '@rentagent/db';
import { clientIpHash, db, logger } from './runtime';

/**
 * Writes a security-relevant event. Never pass secrets, tokens or full request
 * bodies in `meta`. Failures are logged but never break the user flow.
 */
export async function audit(
  action: string,
  {
    actorId,
    target,
    meta,
  }: { actorId?: string; target?: string; meta?: Prisma.InputJsonValue } = {},
): Promise<void> {
  try {
    await db().auditLog.create({
      data: { action, actorId, target, meta, ipHash: await clientIpHash() },
    });
  } catch (error) {
    logger().error({ err: error, action }, 'failed to write audit log');
  }
}
