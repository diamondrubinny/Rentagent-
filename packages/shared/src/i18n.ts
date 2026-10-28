/**
 * Locales that ship with built-in, reviewed UI translations.
 * Operators can add more locales at runtime (stored in the database).
 */
export const BUILTIN_LOCALES = ['he', 'en', 'ar', 'ru'] as const;
export type BuiltinLocale = (typeof BUILTIN_LOCALES)[number];

export const FALLBACK_LOCALE: BuiltinLocale = 'en';

/** Primary language subtags written right-to-left. */
const RTL_LANGUAGES = new Set([
  'ar', // Arabic
  'arc', // Aramaic
  'ckb', // Central Kurdish (Sorani)
  'dv', // Dhivehi
  'fa', // Persian
  'he', // Hebrew
  'iw', // Hebrew (legacy code)
  'ks', // Kashmiri
  'ku', // Kurdish (Arabic script variants)
  'ps', // Pashto
  'sd', // Sindhi
  'syr', // Syriac
  'ug', // Uyghur
  'ur', // Urdu
  'yi', // Yiddish
]);

/** Scripts written right-to-left, used when a locale carries an explicit script subtag. */
const RTL_SCRIPTS = new Set(['Arab', 'Hebr', 'Syrc', 'Thaa', 'Nkoo', 'Adlm', 'Rohg']);

export type TextDirection = 'ltr' | 'rtl';

export function isBuiltinLocale(value: string): value is BuiltinLocale {
  return (BUILTIN_LOCALES as readonly string[]).includes(value);
}

/** Returns a canonical BCP 47 tag (e.g. "pt-br" -> "pt-BR"), or null if the tag is invalid. */
export function canonicalizeLocale(tag: string): string | null {
  try {
    const [canonical] = Intl.getCanonicalLocales(tag);
    return canonical ?? null;
  } catch {
    return null;
  }
}

export function getTextDirection(tag: string): TextDirection {
  const canonical = canonicalizeLocale(tag);
  if (!canonical) return 'ltr';
  const locale = new Intl.Locale(canonical);
  if (locale.script) return RTL_SCRIPTS.has(locale.script) ? 'rtl' : 'ltr';
  return RTL_LANGUAGES.has(locale.language) ? 'rtl' : 'ltr';
}

/** Native display name of a locale, e.g. "he" -> "עברית". Falls back to the tag itself. */
export function getLocaleNativeName(tag: string): string {
  const canonical = canonicalizeLocale(tag);
  if (!canonical) return tag;
  try {
    const name = new Intl.DisplayNames([canonical], { type: 'language' }).of(canonical);
    return name ?? canonical;
  } catch {
    return canonical;
  }
}

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
