'use server';

import { decodeLicense, runLicenseCheck, VENDOR_PUBLIC_KEYS } from '@rentagent/license';
import { getServerEnv } from '@rentagent/core';
import { settingUpsert } from '@rentagent/db';
import { revalidatePath } from 'next/cache';
import { type ActionResult, authorizeAction } from '@/lib/server/admin-action';
import { audit } from '@/lib/server/audit';
import {
  appHost,
  EMPTY_LICENSE,
  effectiveToken,
  getLicenseSetting,
  type LicenseSetting,
} from '@/lib/server/license';
import { db } from '@/lib/server/runtime';

const forbidden = { ok: false, error: 'forbidden' } as const;

async function store(next: LicenseSetting, actorId: string) {
  await db().setting.upsert(settingUpsert('license', next, actorId));
  revalidatePath('/', 'layout');
}

async function checked(setting: LicenseSetting): Promise<LicenseSetting> {
  const env = getServerEnv();
  const { token } = effectiveToken(setting);
  if (!env.LICENSE_SERVER_URL || !token) return setting;
  return {
    ...setting,
    check: await runLicenseCheck({
      serverUrl: env.LICENSE_SERVER_URL,
      token,
      host: appHost(),
      version: env.RENTAGENT_VERSION,
      keys: VENDOR_PUBLIC_KEYS,
      previous: setting.check,
    }),
  };
}

/** Stores a license after verifying its signature (expiry and domain are shown, not refused). */
export async function activateLicense(input: { token: string }): Promise<ActionResult> {
  const actor = await authorizeAction('settings.manage');
  if (!actor) return forbidden;
  const token = String(input.token ?? '')
    .replace(/\s+/g, '')
    .slice(0, 4096);
  const decoded = decodeLicense(token, VENDOR_PUBLIC_KEYS);
  if (!decoded.ok) {
    await audit('license.rejected', { actorId: actor.id, meta: { reason: decoded.reason } });
    return { ok: false, error: decoded.reason === 'signature' ? 'signature' : 'malformed' };
  }
  const next = await checked({
    token,
    activatedAt: new Date().toISOString(),
    check: EMPTY_LICENSE.check,
  });
  await store(next, actor.id);
  await audit('license.activated', {
    actorId: actor.id,
    target: `license:${decoded.payload.id}`,
    meta: { tier: decoded.payload.tier, online: next.check.status },
  });
  return { ok: true };
}

export async function removeLicense(): Promise<ActionResult> {
  const actor = await authorizeAction('settings.manage');
  if (!actor) return forbidden;
  await store(EMPTY_LICENSE, actor.id);
  await audit('license.removed', { actorId: actor.id });
  return { ok: true };
}

export async function checkLicenseNow(): Promise<ActionResult> {
  const actor = await authorizeAction('settings.manage');
  if (!actor) return forbidden;
  const current = await getLicenseSetting();
  const withActivation = {
    ...current,
    activatedAt: current.activatedAt ?? new Date().toISOString(),
  };
  const next = await checked(withActivation);
  await store(next, actor.id);
  await audit('license.checked', { actorId: actor.id, meta: { status: next.check.status } });
  return next.check.lastSuccessAt === next.check.lastAttemptAt
    ? { ok: true }
    : { ok: false, error: 'checkFailed' };
}
