'use server';

import { randomToken, rateLimit } from '@rentagent/core';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { CONSENT_MAX_AGE_SECONDS, CONSENT_POLICY_VERSION } from '@/lib/consent';
import { clientIpHash, db, logger, redis } from './runtime';

const ANON_ID_COOKIE = 'ra_cid';
const choicesSchema = z.object({ analytics: z.boolean(), marketing: z.boolean() }).strict();

/** Stores proof of a consent decision. Only a random identifier is kept, never the IP or user. */
export async function recordConsent(input: unknown): Promise<{ ok: boolean }> {
  const parsed = choicesSchema.safeParse(input);
  if (!parsed.success) return { ok: false };

  const limit = await rateLimit(redis(), `consent:${await clientIpHash()}`, 30, 60, {
    failOpen: true,
  });
  if (!limit.allowed) return { ok: false };

  const jar = await cookies();
  let anonId = jar.get(ANON_ID_COOKIE)?.value;
  if (!anonId || !/^[\w-]{16,64}$/.test(anonId)) {
    anonId = randomToken(18);
    jar.set(ANON_ID_COOKIE, anonId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: CONSENT_MAX_AGE_SECONDS,
    });
  }

  try {
    await db().consentRecord.create({
      data: { anonId, policyVersion: CONSENT_POLICY_VERSION, categories: parsed.data },
    });
    return { ok: true };
  } catch (error) {
    logger().error({ err: error }, 'failed to record consent');
    return { ok: false };
  }
}
