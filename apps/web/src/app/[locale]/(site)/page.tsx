import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AgentCard } from '@/components/agent-card';
import { Link } from '@/i18n/navigation';
import { featuredAgents } from '@/lib/server/catalog';
import { getCurrentUser } from '@/lib/server/session';
import { getSiteConfig } from '@/lib/server/site';

interface HomePageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ setup?: string; accountDeleted?: string }>;
}

export default async function HomePage({ params, searchParams }: HomePageProps) {
  const { locale } = await params;
  const { setup, accountDeleted } = await searchParams;
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

  const user = await getCurrentUser();
  const showCatalog = site.catalogPublic || Boolean(user);
  const agents = showCatalog ? await featuredAgents(locale) : [];

  return (
    <div className="space-y-12">
      <section aria-labelledby="hero" className="mx-auto max-w-2xl text-center">
        {accountDeleted === '1' && (
          <p role="status" className="mb-8 rounded-lg bg-success-bg p-4 text-success">
            {t('accountDeleted')}
          </p>
        )}
        {setup === 'done' && (
          <p role="status" className="mb-8 rounded-lg bg-success-bg p-4 text-success">
            {t('setupDone')}
          </p>
        )}
        <h1 id="hero" className="text-4xl font-bold tracking-tight">
          {t('title')}
        </h1>
        <p className="mt-4 text-lg text-muted">{t('subtitle')}</p>
        <p className="mt-8 flex flex-wrap justify-center gap-3">
          {showCatalog ? (
            <Link href="/agents" className="btn btn-primary">
              {t('browse')}
            </Link>
          ) : (
            <Link href="/sign-in" className="btn btn-primary">
              {t('signInToBrowse')}
            </Link>
          )}
          {user && (
            <Link href="/chats" className="btn btn-secondary">
              {t('myChats')}
            </Link>
          )}
        </p>
      </section>

      {showCatalog && (
        <section aria-labelledby="featured">
          <h2 id="featured" className="text-2xl font-bold">
            {t('featuredTitle')}
          </h2>
          {agents.length === 0 ? (
            <p className="mt-4 rounded-lg border border-border bg-surface p-6 text-center">
              {t('noAgentsYet')}
            </p>
          ) : (
            <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {agents.map((agent) => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
            </ul>
          )}
        </section>
      )}

      <section aria-labelledby="how" className="rounded-lg border border-border bg-surface p-6">
        <h2 id="how" className="text-2xl font-bold">
          {t('howTitle')}
        </h2>
        <ol className="mt-4 grid gap-4 md:grid-cols-3">
          {(['step1', 'step2', 'step3'] as const).map((step, index) => (
            <li key={step}>
              <p className="font-bold">
                {index + 1}. {t(`${step}Title`)}
              </p>
              <p className="text-muted">{t(`${step}Body`)}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
