/** Cookie consent model shared by the client manager and the server action. */
export const CONSENT_COOKIE = 'ra_consent';
export const CONSENT_POLICY_VERSION = '2026-10-v1';
export const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 180; // re-ask after ~6 months

export const OPTIONAL_CATEGORIES = ['analytics', 'marketing'] as const;
export type OptionalCategory = (typeof OPTIONAL_CATEGORIES)[number];
export type ConsentChoices = Record<OptionalCategory, boolean>;

export interface StoredConsent {
  v: string;
  c: ConsentChoices;
  t: number;
}

export function parseStoredConsent(raw: string | undefined): StoredConsent | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as StoredConsent;
    if (parsed.v !== CONSENT_POLICY_VERSION || typeof parsed.c !== 'object') return null;
    return {
      v: parsed.v,
      t: Number(parsed.t) || 0,
      c: { analytics: parsed.c.analytics === true, marketing: parsed.c.marketing === true },
    };
  } catch {
    return null;
  }
}
