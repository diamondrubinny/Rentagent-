import { getServerEnv } from '@rentagent/core';
import { getSetting, getSettings } from '@rentagent/db';
import { BUILTIN_LOCALES } from '@rentagent/shared';
import type { MetadataRoute } from 'next';
import { getEnabledLocales } from '@/lib/server/locales';
import { db, logger } from '@/lib/server/runtime';

export const dynamic = 'force-dynamic';

const PUBLIC_PATHS = ['', '/privacy', '/terms', '/cookies', '/accessibility'];

async function pricingPath(): Promise<string[]> {
  try {
    return (await getSetting(db(), 'billing.settings'))?.enabled ? ['/pricing'] : [];
  } catch {
    return [];
  }
}

async function enabledLocaleCodes(): Promise<string[]> {
  try {
    return (await getEnabledLocales()).map((locale) => locale.code);
  } catch {
    return [...BUILTIN_LOCALES];
  }
}

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
  const paths = [...PUBLIC_PATHS, ...(await agentPaths()), ...(await pricingPath())];
  const locales = await enabledLocaleCodes();
  return paths.flatMap((path) =>
    locales.map((locale) => ({
      url: `${appUrl}/${locale}${path}`,
      alternates: {
        languages: Object.fromEntries(locales.map((alt) => [alt, `${appUrl}/${alt}${path}`])),
      },
    })),
  );
}
