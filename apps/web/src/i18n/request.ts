import { getSetting } from '@rentagent/db';
import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { getLocaleMessages } from '@/lib/server/locales';
import { db } from '@/lib/server/runtime';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  // English is merged underneath every locale, so a missing key never breaks a page.
  const messages = await getLocaleMessages(locale);

  // Dates and times are shown in the installation's time zone (UTC until setup sets one).
  const timeZone = (await getSetting(db(), 'site.timeZone').catch(() => undefined)) ?? 'UTC';

  return { locale, messages, timeZone };
});
