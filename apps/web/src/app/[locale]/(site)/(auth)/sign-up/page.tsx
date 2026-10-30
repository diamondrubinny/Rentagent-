import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AuthCard } from '@/components/auth-card';
import { Link, redirect } from '@/i18n/navigation';
import { getCurrentUser } from '@/lib/server/session';
import { getSiteConfig } from '@/lib/server/site';
import { SignUpForm } from './sign-up-form';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Auth.signUp' });
  return { title: t('title') };
}

export default async function SignUpPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (await getCurrentUser()) redirect({ href: '/account', locale });

  const t = await getTranslations('Auth.signUp');
  const site = await getSiteConfig();
  return (
    <AuthCard title={t('title')} intro={t('intro', { siteName: site.name })}>
      {site.registrationOpen ? (
        <SignUpForm locale={locale} />
      ) : (
        <div className="space-y-4">
          <p>{t('closed')}</p>
          <Link className="link" href="/sign-in">
            {t('signInLink')}
          </Link>
        </div>
      )}
    </AuthCard>
  );
}
