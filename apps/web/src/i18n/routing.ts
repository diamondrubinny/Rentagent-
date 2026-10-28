import { BUILTIN_LOCALES, FALLBACK_LOCALE } from '@rentagent/shared';
import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: BUILTIN_LOCALES,
  defaultLocale: FALLBACK_LOCALE,
  localePrefix: 'always',
  localeCookie: {
    name: 'ra_locale',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  },
});
