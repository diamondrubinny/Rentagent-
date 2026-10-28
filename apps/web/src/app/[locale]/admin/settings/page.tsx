import { getSetting } from '@rentagent/db';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { db } from '@/lib/server/runtime';
import { requirePermission } from '@/lib/server/session';
import { getSiteConfig } from '@/lib/server/site';
import { SettingsForm } from './settings-form';
import { UsageSettingsForm } from './usage-form';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Admin.settings' });
  return { title: t('title') };
}

export default async function AdminSettingsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission(locale, 'settings.manage', '/admin/settings');
  const t = await getTranslations('Admin.settings');
  const tUsage = await getTranslations('Admin.usageSettings');
  const site = await getSiteConfig();
  const mode = (await getSetting(db(), 'auth.registrationMode')) ?? 'closed';
  return (
    <section aria-labelledby="settings-title" className="max-w-2xl space-y-6">
      <h1 id="settings-title" className="text-3xl font-bold">
        {t('title')}
      </h1>
      <SettingsForm siteName={site.name} registrationMode={mode} smtpEnabled={site.smtpEnabled} />
      <section
        aria-labelledby="usage-settings-title"
        className="space-y-4 border-t border-border pt-6"
      >
        <h2 id="usage-settings-title" className="text-2xl font-bold">
          {tUsage('title')}
        </h2>
        <UsageSettingsForm
          catalogPublic={site.catalogPublic}
          userDailyRunLimit={site.userDailyRunLimit}
          runRetentionDays={site.runRetentionDays}
        />
      </section>
    </section>
  );
}
