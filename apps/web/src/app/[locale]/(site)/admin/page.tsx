import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { db } from '@/lib/server/runtime';
import { requirePermission } from '@/lib/server/session';
import { getSiteConfig } from '@/lib/server/site';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Admin.overview' });
  return { title: t('title') };
}

export default async function AdminOverviewPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission(locale, 'admin.access');
  const t = await getTranslations('Admin.overview');
  const site = await getSiteConfig();

  const [total, disabled, staffWithout2fa] = await Promise.all([
    db().user.count(),
    db().user.count({ where: { status: 'DISABLED' } }),
    db().user.count({ where: { role: { not: 'USER' }, NOT: { twoFactorEnabled: true } } }),
  ]);

  const stats = [
    { label: t('users'), value: total },
    { label: t('disabled'), value: disabled },
    { label: t('staffWithout2fa'), value: staffWithout2fa },
  ];

  return (
    <section aria-labelledby="overview-title" className="space-y-8">
      <h1 id="overview-title" className="text-3xl font-bold">
        {t('title')}
      </h1>
      <dl className="grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-lg border border-border bg-surface p-4">
            <dt className="text-sm text-muted">{stat.label}</dt>
            <dd className="text-3xl font-bold">{stat.value}</dd>
          </div>
        ))}
      </dl>
      <dl className="grid gap-2 sm:grid-cols-[auto_1fr]">
        <dt className="font-semibold">{t('email')}</dt>
        <dd>{site.smtpEnabled ? t('on') : t('off')}</dd>
        <dt className="font-semibold">{t('registration')}</dt>
        <dd>{site.registrationOpen ? t('open') : t('closed')}</dd>
        <dt className="font-semibold">{t('version')}</dt>
        <dd dir="ltr">{process.env.RENTAGENT_VERSION ?? 'dev'}</dd>
      </dl>
    </section>
  );
}
