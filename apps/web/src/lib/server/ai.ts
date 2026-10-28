import 'server-only';
import type { GatewayDeps } from '@rentagent/ai-gateway';
import { db, encryptionKeyring, logger, redis } from './runtime';

export function gatewayDeps(): GatewayDeps {
  return { db: db(), redis: redis(), keyring: encryptionKeyring(), log: logger() };
}

/** Serializes values for client components (BigInt and Decimal are not serializable). */
export function toPlainNumber(value: { toString(): string } | null | undefined): string | null {
  return value === null || value === undefined ? null : value.toString();
}
