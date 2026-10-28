import { getTextDirection } from '@rentagent/shared';
import type { Metadata, Viewport } from 'next';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { routing } from '@/i18n/routing';
import { getSiteConfig } from '@/lib/server/site';
import '../globals.css';

interface LocaleLayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1115' },
  ],
};

export async function generateMetadata({ params }: LocaleLayoutProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  const site = await getSiteConfig();
  return {
    title: { default: site.name, template: `%s | ${site.name}` },
    description: t('description'),
    applicationName: site.name,
    openGraph: { siteName: site.name, locale, type: 'website' },
    alternates: {
      languages: Object.fromEntries(routing.locales.map((code) => [code, `/${code}`])),
    },
  };
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations('Common');
  const site = await getSiteConfig();

  return (
    <html lang={locale} dir={getTextDirection(locale)}>
      <body className="flex min-h-screen flex-col">
        <NextIntlClientProvider>
          <a
            href="#main"
            className="btn btn-primary absolute start-2 top-2 z-50 -translate-y-24 focus:translate-y-0"
          >
            {t('skipToContent')}
          </a>
          <SiteHeader siteName={site.name} />
          <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
            {children}
          </main>
          <SiteFooter siteName={site.name} optionalTrackersEnabled={site.optionalTrackersEnabled} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
