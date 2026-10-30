import { getTextDirection } from '@rentagent/shared';
import type { Metadata, Viewport } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { ClientMessages } from '@/components/client-messages';
import { A11Y_BOOT_SCRIPT } from '@/lib/a11y-preferences';
import { routing } from '@/i18n/routing';
import { ensureRoutingPublished, getEnabledLocales } from '@/lib/server/locales';
import { brandingCss, getBranding, imageVersion } from '@/lib/server/branding';
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
  const { branding } = await getBranding();
  return {
    title: { default: site.name, template: `%s | ${site.name}` },
    description: t('description'),
    applicationName: site.name,
    openGraph: { siteName: site.name, locale, type: 'website' },
    ...(branding.favicon
      ? { icons: { icon: `/api/branding/favicon?v=${imageVersion(branding.favicon)}` } }
      : {}),
    alternates: {
      languages: Object.fromEntries(
        (await getEnabledLocales()).map(({ code }) => [code, `/${code}`]),
      ),
    },
  };
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  // Routes exist for every supported locale; only enabled ones are served.
  if (!(await getEnabledLocales()).some((enabled) => enabled.code === locale)) notFound();
  setRequestLocale(locale);
  await ensureRoutingPublished();

  const { branding: brand } = await getBranding();
  const theme = brandingCss(brand);
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html lang={locale} dir={getTextDirection(locale)} suppressHydrationWarning>
      <head>
        {/* Applies saved reading aids before the first paint (nonce: strict CSP). */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: A11Y_BOOT_SCRIPT }} />
      </head>
      <body className="flex min-h-screen flex-col">
        {theme && (
          <style href="rentagent-brand" precedence="high">
            {theme}
          </style>
        )}
        <ClientMessages>{children}</ClientMessages>
      </body>
    </html>
  );
}
