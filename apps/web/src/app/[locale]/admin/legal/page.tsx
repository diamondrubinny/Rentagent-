import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { getLegalSettings, LEGAL_OVERRIDE_MAX_CHARS, LEGAL_PAGES } from '@/lib/server/legal';
import { getEnabledLocales } from '@/lib/server/locales';
import { requirePermission } from '@/lib/server/session';
import { DetailsForm, PageForm } from './legal-forms';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'AdminLegal' });
  return { title: t('title') };
}

const TITLE_KEYS = {
  privacy: 'privacyTitle',
  terms: 'termsTitle',
  cookies: 'cookiesTitle',
  accessibility: 'accessibilityTitle',
} as const;

export default async function AdminLegalPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission(locale, 'settings.manage', '/admin/legal');
  const [t, tLegal, legal, locales] = await Promise.all([
    getTranslations('AdminLegal'),
    getTranslations('Legal'),
    getLegalSettings(),
    getEnabledLocales(),
  ]);
  const localeOptions = locales.map((item) => ({
    code: item.code,
    name: item.nativeName,
    dir: item.direction,
  }));
  return (
    <section aria-labelledby="legal-admin-title" className="max-w-3xl space-y-10">
      <div>
        <h1 id="legal-admin-title" className="text-3xl font-bold">
          {t('title')}
        </h1>
        <p className="mt-2 text-muted">{t('intro')}</p>
        <p role="note" className="mt-4 rounded-lg border border-border bg-warning-bg p-4">
          {t('professionalNotice')}
        </p>
      </div>
      <section aria-labelledby="legal-details-title" className="space-y-4">
        <h2 id="legal-details-title" className="text-xl font-bold">
          {t('details')}
        </h2>
        <p className="text-sm text-muted">{t('detailsHint')}</p>
        <DetailsForm
          values={{
            company: legal.company,
            address: legal.address,
            country: legal.country,
            contactEmail: legal.contactEmail,
            privacyEmail: legal.privacyEmail,
            dpoName: legal.dpoName,
            accessibilityName: legal.accessibilityName,
            accessibilityEmail: legal.accessibilityEmail,
            accessibilityPhone: legal.accessibilityPhone,
            accessibilityResponseDays: String(legal.accessibilityResponseDays),
          }}
        />
      </section>
      {LEGAL_PAGES.map((page) => (
        <section key={page} aria-labelledby={`legal-${page}-title`} className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id={`legal-${page}-title`} className="text-xl font-bold">
              {tLegal(TITLE_KEYS[page])}
            </h2>
            <p className="text-sm">
              <span className="me-3">
                {legal.reviewed[page] ? t('statusReviewed') : t('statusDraft')}
              </span>
              <Link href={`/${page}`} className="link">
                {t('view', { page: tLegal(TITLE_KEYS[page]) })}
              </Link>
            </p>
          </div>
          <PageForm
            page={page}
            reviewed={legal.reviewed[page] === true}
            locales={localeOptions}
            overrides={legal.overrides[page] ?? {}}
            maxChars={LEGAL_OVERRIDE_MAX_CHARS}
          />
        </section>
      ))}
    </section>
  );
}
