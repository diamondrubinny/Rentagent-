import { can } from '@rentagent/shared';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { ClientMessages } from '@/components/client-messages';
import { Link } from '@/i18n/navigation';
import { getLicenseState } from '@/lib/server/license';
import { requirePermission } from '@/lib/server/session';

const ADMIN_NAMESPACES = [
  'Admin',
  'AdminAgents',
  'AdminAi',
  'AdminBilling',
  'AdminBranding',
  'AdminLanguages',
  'AdminLegal',
  'AdminLicense',
  'AdminTools',
  'AdminWebhooks',
  'Setup',
];

interface AdminLayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function AdminLayout({ children, params }: AdminLayoutProps) {
  const { locale } = await params;
  const user = await requirePermission(locale, 'admin.access');
  const t = await getTranslations('Admin');
  const tAi = await getTranslations('AdminAi');
  const tAgents = await getTranslations('AdminAgents');
  const tTools = await getTranslations('AdminTools');
  const tLanguages = await getTranslations('AdminLanguages');
  const tBilling = await getTranslations('AdminBilling');
  const tBranding = await getTranslations('AdminBranding');
  const tWebhooks = await getTranslations('AdminWebhooks');
  const tLegal = await getTranslations('AdminLegal');
  const tLicense = await getTranslations('AdminLicense');
  const license = await getLicenseState();
  const licenseProblem =
    license.status !== 'valid' && license.status !== 'none'
      ? tLicense(`banner.${license.status}`)
      : license.overUserLimit
        ? tLicense('banner.overUsers')
        : license.graceDaysLeft !== null
          ? tLicense('banner.grace', { days: license.graceDaysLeft })
          : null;
  const links = [
    { href: '/admin', label: t('overview.title'), show: true },
    { href: '/admin/users', label: t('users.title'), show: can(user.role, 'users.read') },
    { href: '/admin/audit', label: t('audit.title'), show: can(user.role, 'audit.read') },
    { href: '/admin/agents', label: tAgents('list.title'), show: can(user.role, 'agents.manage') },
    { href: '/admin/runs', label: tAgents('runs.title'), show: can(user.role, 'agents.manage') },
    { href: '/admin/tools', label: tTools('title'), show: can(user.role, 'settings.manage') },
    {
      href: '/admin/billing',
      label: tBilling('title'),
      show: can(user.role, 'billing.manage'),
    },
    {
      href: '/admin/branding',
      label: tBranding('title'),
      show: can(user.role, 'settings.manage'),
    },
    {
      href: '/admin/webhooks',
      label: tWebhooks('title'),
      show: can(user.role, 'settings.manage'),
    },
    {
      href: '/admin/legal',
      label: tLegal('title'),
      show: can(user.role, 'settings.manage'),
    },
    {
      href: '/admin/license',
      label: tLicense('title'),
      show: can(user.role, 'settings.manage'),
    },
    {
      href: '/admin/languages',
      label: tLanguages('title'),
      show: can(user.role, 'settings.manage'),
    },
    {
      href: '/admin/providers',
      label: tAi('providers.title'),
      show: can(user.role, 'providers.manage'),
    },
    {
      href: '/admin/routing',
      label: tAi('routing.title'),
      show: can(user.role, 'providers.manage'),
    },
    {
      href: '/admin/playground',
      label: tAi('playground.title'),
      show: can(user.role, 'providers.manage'),
    },
    { href: '/admin/usage', label: tAi('usage.title'), show: can(user.role, 'providers.manage') },
    {
      href: '/admin/settings',
      label: t('settings.title'),
      show: can(user.role, 'settings.manage'),
    },
  ] as const;
  return (
    <div className="grid gap-8 md:grid-cols-[12rem_1fr]">
      <nav aria-label={t('nav')}>
        <p className="mb-3 text-sm font-semibold uppercase text-muted">{t('area')}</p>
        <ul className="space-y-2">
          {links
            .filter((link) => link.show)
            .map((link) => (
              <li key={link.href}>
                <Link className="link" href={link.href}>
                  {link.label}
                </Link>
              </li>
            ))}
        </ul>
      </nav>
      <div className="min-w-0">
        {licenseProblem && can(user.role, 'settings.manage') && (
          <p role="note" className="mb-6 rounded-lg border border-border bg-warning-bg p-4">
            {licenseProblem}{' '}
            <Link className="link" href="/admin/license">
              {tLicense('banner.open')}
            </Link>
          </p>
        )}
        <ClientMessages namespaces={ADMIN_NAMESPACES}>{children}</ClientMessages>
      </div>
    </div>
  );
}
