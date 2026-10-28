import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { CatalogAgent } from '@/lib/server/catalog';

/** Catalog card; the whole card is one link named by the agent. */
export async function AgentCard({
  agent,
  headingLevel = 3,
}: {
  agent: CatalogAgent;
  headingLevel?: 2 | 3;
}) {
  const t = await getTranslations('Catalog');
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <li className="card-link relative flex flex-col rounded-lg border border-border bg-surface p-4">
      <p className="mb-2 flex flex-wrap gap-2 text-sm">
        <span className="rounded-full border border-border px-2 py-0.5">
          {t(`categories.${agent.category}`)}
        </span>
        {agent.featured && (
          <span className="rounded-full bg-primary px-2 py-0.5 text-primary-fg">
            {t('featured')}
          </span>
        )}
      </p>
      <Heading className="text-lg font-bold" dir="auto">
        <Link href={`/agents/${agent.slug}`} className="no-underline after:absolute after:inset-0">
          {agent.name}
        </Link>
      </Heading>
      <p className="mt-2 line-clamp-3 text-muted" dir="auto">
        {agent.description}
      </p>
    </li>
  );
}
