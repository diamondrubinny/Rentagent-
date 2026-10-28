import type { VendorKey } from './token';

/**
 * Public keys that sign RentAgent licenses. The matching private keys stay with
 * the vendor (see docs/LICENSING.md: `license-admin keygen`). Several keys can be
 * listed so a key can be rotated without invalidating licenses already issued.
 *
 * While this list is empty, no license can be verified: installations run with
 * the free tier (everything works; "Powered by" stays visible).
 */
export const VENDOR_PUBLIC_KEYS: readonly VendorKey[] = [];
