import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

type Messages = Record<string, unknown>;

/** Deep-merges locale messages over the fallback so a missing key never breaks a page. */
function mergeMessages(base: Messages, override: Messages): Messages {
  const result: Messages = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = result[key];
    result[key] =
      value && typeof value === 'object' && current && typeof current === 'object'
        ? mergeMessages(current as Messages, value as Messages)
        : value;
  }
  return result;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  const fallback = (await import('../../messages/en.json')).default as Messages;
  const messages =
    locale === 'en'
      ? fallback
      : mergeMessages(
          fallback,
          (await import(`../../messages/${locale}.json`)).default as Messages,
        );

  return { locale, messages };
});
