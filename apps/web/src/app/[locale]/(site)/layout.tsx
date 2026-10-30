import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { AccessibilityMenu } from '@/components/a11y/accessibility-menu';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { getBranding } from '@/lib/server/branding';
import { getSiteConfig } from '@/lib/server/site';

/** The public site and app: skip link, header, main content, footer, reading aids. */
export default async function SiteLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('Common');
  const site = await getSiteConfig();
  const { features } = await getBranding();
  return (
    <>
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
      {features.a11yWidget && <AccessibilityMenu />}
    </>
  );
}
