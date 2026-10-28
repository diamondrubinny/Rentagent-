'use server';

import {
  enqueueSystemJob,
  getServerEnv,
  I18N_KEYS,
  type TranslationJobProgress,
} from '@rentagent/core';
import { TextDirection } from '@rentagent/db';
import {
  flattenMessages,
  getLocaleNativeName,
  getTextDirection,
  isCompatibleTranslation,
  isSupportedLocale,
} from '@rentagent/shared';
import { revalidatePath } from 'next/cache';
import { type ActionResult, authorizeAction } from '@/lib/server/admin-action';
import { audit } from '@/lib/server/audit';
import { builtinMessages, englishMessages, publishLocaleChange } from '@/lib/server/locales';
import { db, redis } from '@/lib/server/runtime';

const forbidden = { ok: false, error: 'forbidden' } as const;
const MAX_VALUE = 5_000;

async function changed() {
  await publishLocaleChange();
  revalidatePath('/', 'layout');
}

/** English keys still without a translation in this locale (built-in file or database). */
async function missingEntries(locale: string): Promise<Record<string, string>> {
  const source = flattenMessages(await englishMessages());
  const builtin = flattenMessages((await builtinMessages(locale)) ?? {});
  const stored = new Set(
    (await db().translation.findMany({ where: { locale }, select: { key: true } })).map(
      (r) => r.key,
    ),
  );
  return Object.fromEntries(
    Object.entries(source).filter(([key]) => !(key in builtin) && !stored.has(key)),
  );
}

async function startTranslation(locale: string): Promise<number> {
  const entries = await missingEntries(locale);
  const total = Object.keys(entries).length;
  if (total === 0) return 0;
  const progress: TranslationJobProgress = {
    status: 'running',
    total,
    translated: 0,
    rejected: 0,
    updatedAt: new Date().toISOString(),
  };
  await redis().set(I18N_KEYS.job(locale), JSON.stringify(progress), 'EX', 7 * 24 * 3600);
  await enqueueSystemJob(getServerEnv().REDIS_URL, {
    name: 'translate-locale',
    data: { locale, entries },
  });
  return total;
}

/** Enables a supported language, optionally machine-translating its missing strings. */
export async function enableLocale(code: string, autoTranslate: boolean): Promise<ActionResult> {
  const actor = await authorizeAction('settings.manage');
  if (!actor) return forbidden;
  if (!isSupportedLocale(code)) return { ok: false, error: 'invalid' };
  const data = {
    nativeName: getLocaleNativeName(code),
    direction: getTextDirection(code) === 'rtl' ? TextDirection.RTL : TextDirection.LTR,
    enabled: true,
  };
  await db().locale.upsert({
    where: { code },
    create: { code, ...data, builtin: (await builtinMessages(code)) !== null || code === 'en' },
    update: data,
  });
  const queued = autoTranslate === true ? await startTranslation(code) : 0;
  await audit('i18n.locale_enabled', {
    actorId: actor.id,
    target: `locale:${code}`,
    meta: { queued },
  });
  await changed();
  return { ok: true };
}

export async function disableLocale(code: string): Promise<ActionResult> {
  const actor = await authorizeAction('settings.manage');
  if (!actor) return forbidden;
  const locale = isSupportedLocale(code) ? await db().locale.findUnique({ where: { code } }) : null;
  if (!locale) return { ok: false, error: 'notFound' };
  if (locale.isDefault) return { ok: false, error: 'defaultLocale' };
  await db().locale.update({ where: { code }, data: { enabled: false } });
  await audit('i18n.locale_disabled', { actorId: actor.id, target: `locale:${code}` });
  await changed();
  return { ok: true };
}

export async function setDefaultLocale(code: string): Promise<ActionResult> {
  const actor = await authorizeAction('settings.manage');
  if (!actor) return forbidden;
  const locale = isSupportedLocale(code) ? await db().locale.findUnique({ where: { code } }) : null;
  if (!locale?.enabled) return { ok: false, error: 'notFound' };
  await db().$transaction([
    db().locale.updateMany({ where: { isDefault: true }, data: { isDefault: false } }),
    db().locale.update({ where: { code }, data: { isDefault: true } }),
    db().setting.upsert({
      where: { key: 'site.defaultLocale' },
      create: { key: 'site.defaultLocale', value: code, updatedBy: actor.id },
      update: { value: code, updatedBy: actor.id },
    }),
  ]);
  await audit('i18n.default_locale_set', { actorId: actor.id, target: `locale:${code}` });
  await changed();
  return { ok: true };
}

/** Re-runs machine translation for strings that are still missing. */
export async function translateMissing(code: string): Promise<ActionResult & { queued?: number }> {
  const actor = await authorizeAction('settings.manage');
  if (!actor) return forbidden;
  if (!isSupportedLocale(code) || code === 'en') return { ok: false, error: 'invalid' };
  const queued = await startTranslation(code);
  await audit('i18n.auto_translate_started', {
    actorId: actor.id,
    target: `locale:${code}`,
    meta: { queued },
  });
  return { ok: true, queued };
}

export async function translationProgress(code: string): Promise<TranslationJobProgress | null> {
  if (!(await authorizeAction('settings.manage')) || !isSupportedLocale(code)) return null;
  const raw = await redis().get(I18N_KEYS.job(code));
  return raw ? (JSON.parse(raw) as TranslationJobProgress) : null;
}

/** Saves a string; a human edit is always "reviewed". */
export async function saveTranslation(
  code: string,
  key: string,
  value: string,
): Promise<ActionResult> {
  const actor = await authorizeAction('settings.manage');
  if (!actor) return forbidden;
  if (!isSupportedLocale(code) || typeof value !== 'string' || value.length > MAX_VALUE)
    return { ok: false, error: 'invalid' };
  const source = flattenMessages(await englishMessages())[key];
  if (source === undefined) return { ok: false, error: 'unknownKey' };
  const text = value.normalize('NFC');
  if (!isCompatibleTranslation(source, text)) return { ok: false, error: 'icuMismatch' };
  if (!(await db().locale.findUnique({ where: { code } }))) return { ok: false, error: 'notFound' };
  await db().translation.upsert({
    where: { locale_key: { locale: code, key } },
    create: { locale: code, key, value: text, status: 'REVIEWED', updatedBy: actor.id },
    update: { value: text, status: 'REVIEWED', updatedBy: actor.id },
  });
  await audit('i18n.translation_saved', {
    actorId: actor.id,
    target: `locale:${code}`,
    meta: { key },
  });
  await changed();
  return { ok: true };
}

export async function markReviewed(code: string, keys: string[]): Promise<ActionResult> {
  const actor = await authorizeAction('settings.manage');
  if (!actor) return forbidden;
  if (!isSupportedLocale(code) || !Array.isArray(keys) || keys.length > 500)
    return { ok: false, error: 'invalid' };
  await db().translation.updateMany({
    where: { locale: code, key: { in: keys.map(String) }, status: 'AUTO' },
    data: { status: 'REVIEWED', updatedBy: actor.id },
  });
  await audit('i18n.translations_reviewed', {
    actorId: actor.id,
    target: `locale:${code}`,
    meta: { count: keys.length },
  });
  await changed();
  return { ok: true };
}

/** Removes an override: built-in languages fall back to their reviewed file, others to English. */
export async function resetTranslation(code: string, key: string): Promise<ActionResult> {
  const actor = await authorizeAction('settings.manage');
  if (!actor) return forbidden;
  if (!isSupportedLocale(code) || typeof key !== 'string') return { ok: false, error: 'invalid' };
  await db().translation.deleteMany({ where: { locale: code, key } });
  await audit('i18n.translation_reset', {
    actorId: actor.id,
    target: `locale:${code}`,
    meta: { key },
  });
  await changed();
  return { ok: true };
}
