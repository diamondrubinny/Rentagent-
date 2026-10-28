import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AuthCard } from '@/components/auth-card';
import { redirect } from '@/i18n/navigation';
import { safeNextPath } from '@/lib/auth-errors';
import { getCurrentUser } from '@/lib/server/session';
import { getSiteConfig } from '@/lib/server/site';
import { SignInForm } from './sign-in-form';

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    next?: string;
    verified?: string;
    reset?: string;
    setup?: string;
    error?: string;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Auth.signIn' });
  return { title: t('title'), robots: { index: false } };
}

export default async function SignInPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const query = await searchParams;
  setRequestLocale(locale);
  if (await getCurrentUser()) redirect({ href: '/account', locale });

  const t = await getTranslations('Auth.signIn');
  const site = await getSiteConfig();
  let notice: string | undefined;
  if (query.setup) notice = t('setupNotice');
  else if (query.verified) notice = t('verifiedNotice');
  else if (query.reset) notice = t('resetNotice');

  return (
    <AuthCard title={t('title')} intro={t('intro', { siteName: site.name })}>
      <SignInForm
        nextPath={safeNextPath(query.next, `/${locale}`)}
        notice={notice}
        linkError={query.error ? 'invalidToken' : undefined}
        registrationOpen={site.registrationOpen}
      />
    </AuthCard>
  );
}
