'use server';

import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getServerEnv } from '@rentagent/core';
import { settingUpsert } from '@rentagent/db';
import { checkPrimaryColor, isHexColor } from '@rentagent/shared';
import { revalidatePath } from 'next/cache';
import { type ActionResult, authorizeAction } from '@/lib/server/admin-action';
import { audit } from '@/lib/server/audit';
import { type Branding, getBranding } from '@/lib/server/branding';
import { db } from '@/lib/server/runtime';

export type BrandingResult = ActionResult & { fieldErrors?: Record<string, string> };

const forbidden = { ok: false, error: 'forbidden' } as const;
const LIMITS = { logo: 512 * 1024, favicon: 256 * 1024 } as const;

/** Raster formats only, recognised by content (SVG is excluded: it can carry scripts). */
function detectImage(
  bytes: Buffer,
  kind: 'logo' | 'favicon',
): { mime: string; ext: string } | null {
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return { mime: 'image/png', ext: 'png' };
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return { mime: 'image/jpeg', ext: 'jpg' };
  if (
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP'
  )
    return { mime: 'image/webp', ext: 'webp' };
  if (kind === 'favicon' && bytes.subarray(0, 4).equals(Buffer.from([0, 0, 1, 0])))
    return { mime: 'image/x-icon', ext: 'ico' };
  return null;
}

async function save(next: Partial<Branding>, actorId: string, action: string) {
  const { branding } = await getBranding();
  await db().setting.upsert(settingUpsert('branding', { ...branding, ...next }, actorId));
  await audit(action, { actorId, meta: Object.keys(next) });
  revalidatePath('/', 'layout');
}

export async function saveColors(input: {
  primaryLight: string;
  primaryDark: string;
}): Promise<BrandingResult> {
  const actor = await authorizeAction('settings.manage');
  if (!actor) return forbidden;
  const fieldErrors: Record<string, string> = {};
  const value = (raw: string, theme: 'light' | 'dark', field: string) => {
    const hex = String(raw ?? '')
      .trim()
      .toLowerCase();
    if (!hex) return null;
    if (!isHexColor(hex)) fieldErrors[field] = 'invalidColor';
    else if (!checkPrimaryColor(hex, theme).ok) fieldErrors[field] = 'lowContrast';
    return hex;
  };
  const primaryLight = value(input.primaryLight, 'light', 'primaryLight');
  const primaryDark = value(input.primaryDark, 'dark', 'primaryDark');
  if (Object.keys(fieldErrors).length) return { ok: false, error: 'invalid', fieldErrors };
  await save({ primaryLight, primaryDark }, actor.id, 'branding.colors_updated');
  return { ok: true };
}

export async function uploadBrandImage(
  kind: 'logo' | 'favicon',
  form: FormData,
): Promise<BrandingResult> {
  const actor = await authorizeAction('settings.manage');
  if (!actor) return forbidden;
  if (kind !== 'logo' && kind !== 'favicon') return { ok: false, error: 'invalid' };
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'noFile' };
  if (file.size > LIMITS[kind]) return { ok: false, error: 'tooLarge' };
  const bytes = Buffer.from(await file.arrayBuffer());
  const type = detectImage(bytes, kind);
  if (!type) return { ok: false, error: 'unsupportedImage' };
  const name = `${kind}-${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}.${type.ext}`;
  const dir = join(getServerEnv().FILES_DIR, 'branding');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), bytes, { mode: 0o640 });
  const { branding } = await getBranding();
  const previous = branding[kind];
  await save({ [kind]: { file: name, mime: type.mime } }, actor.id, 'branding.image_uploaded');
  if (previous && previous.file !== name) await rm(join(dir, previous.file), { force: true });
  return { ok: true };
}

export async function removeBrandImage(kind: 'logo' | 'favicon'): Promise<BrandingResult> {
  const actor = await authorizeAction('settings.manage');
  if (!actor) return forbidden;
  if (kind !== 'logo' && kind !== 'favicon') return { ok: false, error: 'invalid' };
  const { branding } = await getBranding();
  const previous = branding[kind];
  await save({ [kind]: null }, actor.id, 'branding.image_removed');
  if (previous)
    await rm(join(getServerEnv().FILES_DIR, 'branding', previous.file), { force: true });
  return { ok: true };
}

export async function saveFeatures(input: {
  feedback: boolean;
  semanticSearch: boolean;
  a11yWidget: boolean;
  publicApi: boolean;
  schedules: boolean;
  hidePoweredBy: boolean;
}): Promise<BrandingResult> {
  const actor = await authorizeAction('settings.manage');
  if (!actor) return forbidden;
  const features = {
    feedback: input.feedback === true,
    semanticSearch: input.semanticSearch === true,
    a11yWidget: input.a11yWidget === true,
    publicApi: input.publicApi === true,
    schedules: input.schedules === true,
  };
  await db().setting.upsert(settingUpsert('features', features, actor.id));
  await save(
    { hidePoweredBy: input.hidePoweredBy === true },
    actor.id,
    'settings.features_updated',
  );
  return { ok: true };
}
