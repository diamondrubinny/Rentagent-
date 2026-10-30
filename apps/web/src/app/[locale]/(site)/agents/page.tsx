import { AGENT_CATEGORIES } from '@rentagent/shared';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AgentCard } from '@/components/agent-card';
import { isCategory, relatedAgents, searchCatalog } from '@/lib/server/catalog';
import { requireUser } from '@/lib/server/session';
import { getSiteConfig } from '@/lib/server/site';

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string | string[]; category?: string | string[] }>;
}

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.slice(0, 200) ?? '';

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Catalog' });
  return { title: t('title'), description: t('intro') };
}

export default async function CatalogPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const site = await getSiteConfig();
  if (!site.catalogPublic) await requireUser(locale, '/agents');
  const query = first((await searchParams).q).trim();
  const categoryParam = first((await searchParams).category);
  const category = isCategory(categoryParam) ? categoryParam : '';
  const t = await getTranslations('Catalog');

  const agents = await searchCatalog(locale, { query, category });
  const related = query
    ? await relatedAgents(
        locale,
        query,
        agents.map((agent) => agent.id),
      )
    : [];
  const filtered = Boolean(query || category);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="mt-2 text-muted">{t('intro')}</p>
      </div>

      <form
        method="get"
        role="search"
        aria-label={t('searchLabel')}
        className="flex flex-wrap items-end gap-3"
      >
        <div className="min-w-60 flex-1">
          <label htmlFor="catalog-q" className="mb-1 block font-semibold">
            {t('searchLabel')}
          </label>
          <input
            id="catalog-q"
            name="q"
            type="search"
            defaultValue={query}
            dir="auto"
            maxLength={200}
            aria-describedby="catalog-q-hint"
            className="field-input"
          />
          <p id="catalog-q-hint" className="mt-1 text-sm text-muted">
            {t('searchHint')}
          </p>
        </div>
        <div>
          <label htmlFor="catalog-category" className="mb-1 block font-semibold">
            {t('category')}
          </label>
          <select
            id="catalog-category"
            name="category"
            defaultValue={category}
            className="field-input"
          >
            <option value="">{t('allCategories')}</option>
            {AGENT_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {t(`categories.${value}`)}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-primary mb-7">
          {t('search')}
        </button>
      </form>

      <section aria-labelledby="catalog-results">
        <h2 id="catalog-results" className="text-xl font-bold">
          {filtered ? t('results', { count: agents.length }) : t('allAgents')}
        </h2>
        <p role="status" className="sr-only">
          {filtered ? t('results', { count: agents.length }) : ''}
        </p>
        {agents.length === 0 ? (
          <p className="mt-4 rounded-lg border border-border p-6 text-center">
            {filtered ? t('noResults') : t('empty')}
          </p>
        ) : (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </ul>
        )}
      </section>

      {related.length > 0 && (
        <section aria-labelledby="catalog-related">
          <h2 id="catalog-related" className="text-xl font-bold">
            {t('related')}
          </h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
