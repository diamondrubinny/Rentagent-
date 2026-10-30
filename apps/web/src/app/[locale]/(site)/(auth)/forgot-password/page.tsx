import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AuthCard } from '@/components/auth-card';
import { getSiteConfig } from '@/lib/server/site';
import { ForgotPasswordForm } from './forgot-password-form';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Auth.forgot' });
  return { title: t('title'), robots: { index: false } };
}

export default async function ForgotPasswordPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Auth.forgot');
  const site = await getSiteConfig();
  return (
    <AuthCard title={t('title')} intro={site.smtpEnabled ? t('intro') : t('noEmail')}>
      {site.smtpEnabled && <ForgotPasswordForm locale={locale} />}
    </AuthCard>
  );
}
