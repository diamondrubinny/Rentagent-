import 'server-only';
import { getSettings } from '@rentagent/db';
import { cache } from 'react';
import { db, logger } from './runtime';

export interface SiteConfig {
  name: string;
  setupComplete: boolean;
  optionalTrackersEnabled: boolean;
  /** Self-service sign-up is possible (operator opened it and SMTP works for verification). */
  registrationOpen: boolean;
  smtpEnabled: boolean;
  /** Visitors may browse the agent catalog without signing in. */
  catalogPublic: boolean;
  /** Live runs per user per day; 0 = unlimited. */
  userDailyRunLimit: number;
  /** Days before untouched conversations are deleted; 0 = keep. */
  runRetentionDays: number;
}

export const DEFAULT_USER_DAILY_RUN_LIMIT = 50;
export const DEFAULT_RUN_RETENTION_DAYS = 180;

const DEFAULT_SITE_NAME = 'RentAgent';

/** Installation-level settings needed on most pages; cached per request. */
export const getSiteConfig = cache(async (): Promise<SiteConfig> => {
  try {
    const settings = await getSettings(db(), [
      'site.name',
      'setup.completedAt',
      'privacy.optionalTrackersEnabled',
      'auth.registrationMode',
      'mail.smtp',
      'agents.catalogPublic',
      'agents.userDailyRunLimit',
      'privacy.runRetentionDays',
    ] as const);
    const smtpEnabled = Boolean(settings['mail.smtp']?.enabled);
    return {
      name: settings['site.name'] ?? DEFAULT_SITE_NAME,
      setupComplete: Boolean(settings['setup.completedAt']),
      optionalTrackersEnabled: settings['privacy.optionalTrackersEnabled'] ?? false,
      registrationOpen: smtpEnabled && settings['auth.registrationMode'] === 'open',
      smtpEnabled,
      catalogPublic: settings['agents.catalogPublic'] ?? true,
      userDailyRunLimit: settings['agents.userDailyRunLimit'] ?? DEFAULT_USER_DAILY_RUN_LIMIT,
      runRetentionDays: settings['privacy.runRetentionDays'] ?? DEFAULT_RUN_RETENTION_DAYS,
    };
  } catch (error) {
    logger().error({ err: error }, 'failed to load site settings');
    throw new Error('Site configuration unavailable');
  }
});
