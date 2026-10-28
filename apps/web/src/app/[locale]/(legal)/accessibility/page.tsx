import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LegalPage } from '@/components/legal-page';
import { getSiteConfig } from '@/lib/server/site';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Legal' });
  return { title: t('accessibilityTitle') };
}

export default async function AccessibilityPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Legal');
  const site = await getSiteConfig();
  return (
    <LegalPage title={t('accessibilityTitle')}>
      <p>{t('accessibilityCommitment', { siteName: site.name })}</p>
    </LegalPage>
  );
}
