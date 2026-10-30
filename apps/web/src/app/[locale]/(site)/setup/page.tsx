import { BUILTIN_LOCALES, getLocaleNativeName } from '@rentagent/shared';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { getSiteConfig } from '@/lib/server/site';
import { SetupForm } from './setup-form';

interface SetupPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: SetupPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Setup' });
  return { title: t('metaTitle'), robots: { index: false, follow: false } };
}

export default async function SetupPage({ params }: SetupPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  // The wizard disappears once setup is complete.
  if ((await getSiteConfig()).setupComplete) notFound();

  const t = await getTranslations('Setup');
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-bold">{t('title')}</h1>
      <p className="mt-2 text-muted">{t('intro')}</p>
      <p className="mt-1 text-sm text-muted">{t('requiredNote')}</p>
      <SetupForm
        defaults={{ defaultLocale: locale, timeZone: 'UTC', baseCurrency: 'USD' }}
        locales={BUILTIN_LOCALES.map((code) => ({ code, name: getLocaleNativeName(code) }))}
        timeZones={Intl.supportedValuesOf('timeZone')}
        currencies={Intl.supportedValuesOf('currency')}
      />
    </div>
  );
}
