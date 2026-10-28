import { getServerEnv } from '@rentagent/core';
import { getSettings } from '@rentagent/db';
import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';
import { db, logger } from '@/lib/server/runtime';

export const dynamic = 'force-dynamic';

const PUBLIC_PATHS = ['', '/privacy', '/terms', '/cookies', '/accessibility'];

/** Agent pages are listed only when the operator made the catalog public. */
async function agentPaths(): Promise<string[]> {
  try {
    const settings = await getSettings(db(), [
      'agents.catalogPublic',
      'setup.completedAt',
    ] as const);
    if (!settings['setup.completedAt'] || settings['agents.catalogPublic'] === false) return [];
    const agents = await db().agent.findMany({
      where: { status: 'PUBLISHED', publishedVersionId: { not: null } },
      select: { slug: true },
      take: 5000,
    });
    return ['/agents', ...agents.map((agent) => `/agents/${agent.slug}`)];
  } catch (error) {
    logger().warn(
      { err: error instanceof Error ? error.message : String(error) },
      'sitemap: agents unavailable',
    );
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const appUrl = getServerEnv().APP_URL;
  const paths = [...PUBLIC_PATHS, ...(await agentPaths())];
  return paths.flatMap((path) =>
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
