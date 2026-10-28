import 'server-only';
import { getSettings } from '@rentagent/db';
import { cache } from 'react';
import { db, logger } from './runtime';

export interface SiteConfig {
  name: string;
  setupComplete: boolean;
  optionalTrackersEnabled: boolean;
}

const DEFAULT_SITE_NAME = 'RentAgent';

/** Installation-level settings needed on most pages; cached per request. */
export const getSiteConfig = cache(async (): Promise<SiteConfig> => {
  try {
    const settings = await getSettings(db(), [
      'site.name',
      'setup.completedAt',
      'privacy.optionalTrackersEnabled',
    ] as const);
    return {
      name: settings['site.name'] ?? DEFAULT_SITE_NAME,
      setupComplete: Boolean(settings['setup.completedAt']),
      optionalTrackersEnabled: settings['privacy.optionalTrackersEnabled'] ?? false,
    };
  } catch (error) {
    logger().error({ err: error }, 'failed to load site settings');
    throw new Error('Site configuration unavailable');
  }
});
