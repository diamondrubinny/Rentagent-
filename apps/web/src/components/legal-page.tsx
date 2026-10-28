import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { getSiteConfig } from '@/lib/server/site';

/** Shared layout for legal pages. Full draft texts are delivered in phase 7. */
export async function LegalPage({ title, children }: { title: string; children?: ReactNode }) {
  const t = await getTranslations();
  const site = await getSiteConfig();
  return (
    <article aria-labelledby="legal-title" className="mx-auto max-w-3xl">
      <h1 id="legal-title" className="text-3xl font-bold">
        {title}
      </h1>
      <p role="note" className="mt-6 rounded-lg border border-border bg-warning-bg p-4">
        <strong>{t('Common.draft')}:</strong> {t('Legal.draftNotice', { siteName: site.name })}
      </p>
      <div className="mt-6 space-y-4">{children}</div>
    </article>
  );
}
