import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getBranding, imageVersion } from '@/lib/server/branding';
import { whiteLabelAllowed } from '@/lib/server/license';
import { requirePermission } from '@/lib/server/session';
import { ColorsForm, FeaturesForm, ImageForm } from './branding-forms';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'AdminBranding' });
  return { title: t('title') };
}

export default async function BrandingPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission(locale, 'settings.manage', '/admin/branding');
  const t = await getTranslations('AdminBranding');
  const { branding, features } = await getBranding();
  return (
    <section aria-labelledby="branding-title" className="max-w-3xl space-y-10">
      <div>
        <h1 id="branding-title" className="text-3xl font-bold">
          {t('title')}
        </h1>
        <p className="mt-2 text-muted">{t('intro')}</p>
      </div>
      <section aria-labelledby="colors-title" className="space-y-4">
        <h2 id="colors-title" className="text-xl font-bold">
          {t('colors')}
        </h2>
        <p className="text-sm text-muted">{t('colorsHint')}</p>
        <ColorsForm
          primaryLight={branding.primaryLight ?? ''}
          primaryDark={branding.primaryDark ?? ''}
        />
      </section>
      <section aria-labelledby="logo-title" className="space-y-4">
        <h2 id="logo-title" className="text-xl font-bold">
          {t('logo')}
        </h2>
        <ImageForm
          kind="logo"
          current={branding.logo ? `/api/branding/logo?v=${imageVersion(branding.logo)}` : null}
        />
      </section>
      <section aria-labelledby="favicon-title" className="space-y-4">
        <h2 id="favicon-title" className="text-xl font-bold">
          {t('favicon')}
        </h2>
        <ImageForm
          kind="favicon"
          current={
            branding.favicon ? `/api/branding/favicon?v=${imageVersion(branding.favicon)}` : null
          }
        />
      </section>
      <section aria-labelledby="features-title" className="space-y-4">
        <h2 id="features-title" className="text-xl font-bold">
          {t('features')}
        </h2>
        <FeaturesForm
          feedback={features.feedback}
          semanticSearch={features.semanticSearch}
          a11yWidget={features.a11yWidget}
          hidePoweredBy={branding.hidePoweredBy}
          whiteLabel={await whiteLabelAllowed()}
        />
      </section>
      <p className="text-sm text-muted">{t('textsHint')}</p>
    </section>
  );
}
