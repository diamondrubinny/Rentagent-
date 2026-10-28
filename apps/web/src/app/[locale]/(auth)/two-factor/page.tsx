import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AuthCard } from '@/components/auth-card';
import { safeNextPath } from '@/lib/auth-errors';
import { TwoFactorForm } from './two-factor-form';

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Auth.twoFactor' });
  return { title: t('title'), robots: { index: false } };
}

export default async function TwoFactorPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { next } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('Auth.twoFactor');
  return (
    <AuthCard title={t('title')} intro={t('intro')}>
      <TwoFactorForm nextPath={safeNextPath(next, `/${locale}`)} />
    </AuthCard>
  );
}
