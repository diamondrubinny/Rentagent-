import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { getSiteConfig } from '@/lib/server/site';

interface HomePageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ setup?: string }>;
}

export default async function HomePage({ params, searchParams }: HomePageProps) {
  const { locale } = await params;
  const { setup } = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations('Home');
  const site = await getSiteConfig();

  if (!site.setupComplete) {
    return (
      <section aria-labelledby="not-configured" className="mx-auto max-w-xl text-center">
        <h1 id="not-configured" className="text-3xl font-bold">
          {t('notConfiguredTitle')}
        </h1>
        <p className="mt-4 text-muted">{t('notConfiguredBody')}</p>
        <Link href="/setup" className="btn btn-primary mt-8">
          {t('goToSetup')}
        </Link>
      </section>
    );
  }

  return (
    <section aria-labelledby="hero" className="mx-auto max-w-2xl text-center">
      {setup === 'done' && (
        <p role="status" className="mb-8 rounded-lg bg-success-bg p-4 text-success">
          {t('setupDone')}
        </p>
      )}
      <h1 id="hero" className="text-4xl font-bold tracking-tight">
        {t('title')}
      </h1>
      <p className="mt-4 text-lg text-muted">{t('subtitle')}</p>
      <p className="mt-10 rounded-lg border border-border bg-surface p-6">{t('comingSoon')}</p>
    </section>
  );
}
