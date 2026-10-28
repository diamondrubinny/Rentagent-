import { can } from '@rentagent/shared';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import { requirePermission } from '@/lib/server/session';

interface AdminLayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function AdminLayout({ children, params }: AdminLayoutProps) {
  const { locale } = await params;
  const user = await requirePermission(locale, 'admin.access');
  const t = await getTranslations('Admin');
  const tAi = await getTranslations('AdminAi');
  const links = [
    { href: '/admin', label: t('overview.title'), show: true },
    { href: '/admin/users', label: t('users.title'), show: can(user.role, 'users.read') },
    { href: '/admin/audit', label: t('audit.title'), show: can(user.role, 'audit.read') },
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
      <div className="min-w-0">{children}</div>
    </div>
  );
}
