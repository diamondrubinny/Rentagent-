import { FALLBACK_LOCALE, SUPPORTED_LOCALES } from '@rentagent/shared';
import { defineRouting } from 'next-intl/routing';

/**
 * Every supported locale has a route; which ones are served is decided at
 * runtime (enabled locales, see lib/locale-routing.ts and the locale layout).
 */
export const routing = defineRouting({
  locales: SUPPORTED_LOCALES,
  defaultLocale: FALLBACK_LOCALE,
  localePrefix: 'always',
  localeCookie: {
    name: 'ra_locale',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  },
});
