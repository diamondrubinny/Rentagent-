import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import { requireUser } from '@/lib/server/session';

interface AccountLayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function AccountLayout({ children, params }: AccountLayoutProps) {
  const { locale } = await params;
  await requireUser(locale, '/account');
  const t = await getTranslations('Account');
  return (
    <div className="grid gap-8 md:grid-cols-[12rem_1fr]">
      <nav aria-label={t('nav')}>
        <ul className="space-y-2">
          <li>
            <Link className="link" href="/account">
              {t('profile.title')}
            </Link>
          </li>
          <li>
            <Link className="link" href="/account/security">
              {t('security.title')}
            </Link>
          </li>
        </ul>
      </nav>
      <div>{children}</div>
    </div>
  );
}
