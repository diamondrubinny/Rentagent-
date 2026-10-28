import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Markdown } from '@/components/markdown';
import { legalDocument, type LegalPageKey } from '@/lib/server/legal';
import { getSiteConfig } from '@/lib/server/site';

const TITLE_KEYS = {
  privacy: 'privacyTitle',
  terms: 'termsTitle',
  cookies: 'cookiesTitle',
  accessibility: 'accessibilityTitle',
} as const;

export async function legalMetadata(page: LegalPageKey, locale: string): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'Legal' });
  return { title: t(TITLE_KEYS[page]) };
}

/**
 * Renders a legal document: the operator's own text, or the draft filled in from
 * this installation's settings. A draft notice stays until the operator marks the
 * page as reviewed by a qualified professional.
 */
export async function LegalPage({ page, locale }: { page: LegalPageKey; locale: string }) {
  setRequestLocale(locale);
  const [t, site, document] = await Promise.all([
    getTranslations(),
    getSiteConfig(),
    legalDocument(page, locale),
  ]);
  return (
    <article aria-labelledby="legal-title" className="mx-auto max-w-3xl">
      <h1 id="legal-title" className="text-3xl font-bold">
        {t(`Legal.${TITLE_KEYS[page]}`)}
      </h1>
      {document.reviewed ? null : (
        <p role="note" className="mt-6 rounded-lg border border-border bg-warning-bg p-4">
          <strong>{t('Common.draft')}:</strong> {t('Legal.draftNotice', { siteName: site.name })}
        </p>
      )}
      <div className="legal mt-6" lang={document.lang === locale ? undefined : document.lang}>
        <Markdown values={document.values}>{document.markdown}</Markdown>
      </div>
    </article>
  );
}
