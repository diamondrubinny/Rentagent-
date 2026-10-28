import 'server-only';
import { I18N_KEYS } from '@rentagent/core';
import {
  BUILTIN_LOCALES,
  FALLBACK_LOCALE,
  getLocaleNativeName,
  getTextDirection,
  isBuiltinLocale,
  type TextDirection,
  unflattenMessages,
} from '@rentagent/shared';
import { cache } from 'react';
import { db, logger, redis } from './runtime';

export interface LocaleInfo {
  code: string;
  nativeName: string;
  direction: TextDirection;
  isDefault: boolean;
  builtin: boolean;
}

type Messages = Record<string, unknown>;

/** Per-process caches, valid while the shared version in Redis is unchanged. */
const globalForLocales = globalThis as unknown as {
  rentagentLocaleCache?: { version: string; messages: Map<string, Messages> };
};

async function currentVersion(): Promise<string> {
  try {
    return (await redis().get(I18N_KEYS.version)) ?? '0';
  } catch {
    return 'unavailable';
  }
}

/** Locales visitors can use, default first. Before setup: the built-ins. */
export const getEnabledLocales = cache(async (): Promise<LocaleInfo[]> => {
  const rows = await db().locale.findMany({ where: { enabled: true }, orderBy: { code: 'asc' } });
  if (rows.length === 0) {
    const configured = process.env.DEFAULT_LOCALE ?? FALLBACK_LOCALE;
    return BUILTIN_LOCALES.map((code) => ({
      code,
      nativeName: getLocaleNativeName(code),
      direction: getTextDirection(code),
      isDefault: code === configured,
      builtin: true,
    }));
  }
  return rows
    .map((row) => ({
      code: row.code,
      nativeName: row.nativeName,
      direction: getTextDirection(row.code),
      isDefault: row.isDefault,
      builtin: row.builtin,
    }))
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
});

export async function isEnabledLocale(code: string): Promise<boolean> {
  return (await getEnabledLocales()).some((locale) => locale.code === code);
}

function deepMerge(base: Messages, override: Messages): Messages {
  const result: Messages = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = result[key];
    result[key] =
      value && typeof value === 'object' && current && typeof current === 'object'
        ? deepMerge(current as Messages, value as Messages)
        : value;
  }
  return result;
}

export async function englishMessages(): Promise<Messages> {
  return (await import('../../../messages/en.json')).default as Messages;
}

export async function builtinMessages(locale: string): Promise<Messages | null> {
  if (!isBuiltinLocale(locale)) return null;
  return (await import(`../../../messages/${locale}.json`)).default as Messages;
}

/**
 * Messages for a locale: English (always complete) ← built-in file ← operator
 * overrides and added-language translations from the database.
 */
export async function getLocaleMessages(locale: string): Promise<Messages> {
  const version = await currentVersion();
  let store = globalForLocales.rentagentLocaleCache;
  if (!store || store.version !== version || version === 'unavailable') {
    store = { version, messages: new Map() };
    globalForLocales.rentagentLocaleCache = store;
  }
  const cached = store.messages.get(locale);
  if (cached) return cached;

  let messages = await englishMessages();
  const builtin = locale === 'en' ? null : await builtinMessages(locale);
  if (builtin) messages = deepMerge(messages, builtin);
  try {
    const rows = await db().translation.findMany({
      where: { locale },
      select: { key: true, value: true },
    });
    if (rows.length)
      messages = deepMerge(
        messages,
        unflattenMessages(Object.fromEntries(rows.map((row) => [row.key, row.value]))),
      );
  } catch (error) {
    logger().error({ err: error, locale }, 'failed to load translations');
  }
  store.messages.set(locale, messages);
  return messages;
}

/** Invalidates message caches everywhere and republishes the routing list. */
export async function publishLocaleChange(): Promise<void> {
  const locales = await db().locale.findMany({ where: { enabled: true } });
  const routing =
    locales.length > 0
      ? {
          enabled: locales.map((locale) => locale.code),
          default: locales.find((locale) => locale.isDefault)?.code ?? locales[0]!.code,
        }
      : null;
  try {
    const pipeline = redis().multi().incr(I18N_KEYS.version);
    if (routing) pipeline.set(I18N_KEYS.routing, JSON.stringify(routing));
    await pipeline.exec();
  } catch (error) {
    logger().error({ err: error }, 'failed to publish locale change');
  }
}

/** Makes sure the proxy knows the enabled locales (e.g. after a Redis restart). */
export async function ensureRoutingPublished(): Promise<void> {
  try {
    if (!(await redis().exists(I18N_KEYS.routing))) await publishLocaleChange();
  } catch {
    // Routing falls back to built-in locales; pages still enforce the real list.
  }
}
