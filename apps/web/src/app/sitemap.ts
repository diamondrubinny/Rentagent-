import { getServerEnv } from '@rentagent/core';
import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';

export const dynamic = 'force-dynamic';

const PUBLIC_PATHS = ['', '/privacy', '/terms', '/cookies', '/accessibility'];

export default function sitemap(): MetadataRoute.Sitemap {
  const appUrl = getServerEnv().APP_URL;
  return PUBLIC_PATHS.flatMap((path) =>
    routing.locales.map((locale) => ({
      url: `${appUrl}/${locale}${path}`,
      alternates: {
        languages: Object.fromEntries(
          routing.locales.map((alt) => [alt, `${appUrl}/${alt}${path}`]),
        ),
      },
    })),
  );
}
