import { getServerEnv } from '@rentagent/core';
import type { MetadataRoute } from 'next';

export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  const appUrl = getServerEnv().APP_URL;
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/*/setup'] },
    sitemap: `${appUrl}/sitemap.xml`,
  };
}
