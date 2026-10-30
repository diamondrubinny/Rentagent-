import { AGENT_TEMPLATES } from '@rentagent/agent-runtime';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { db } from '@/lib/server/runtime';
import { requirePermission } from '@/lib/server/session';
import { CreateAgent } from './create-agent';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'AdminAgents.list' });
  return { title: t('title') };
}

type Localizations = Record<string, { name?: string; description?: string }>;

export default async function AgentsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission(locale, 'agents.manage', '/admin/agents');
  const t = await getTranslations('AdminAgents');
  const agents = await db().agent.findMany({
    where: { status: { not: 'ARCHIVED' } },
    orderBy: { updatedAt: 'desc' },
    include: {
      _count: { select: { runs: true, knowledge: true } },
      versions: { orderBy: { version: 'desc' }, take: 1, select: { version: true } },
    },
  });
  const localized = (value: Localizations, fallback: string) => value?.[locale]?.name || fallback;

  return (
    <section aria-labelledby="agents-title" className="space-y-8">
      <h1 id="agents-title" className="text-3xl font-bold">
        {t('list.title')}
      </h1>
      <p className="text-muted">{t('list.intro')}</p>
      {agents.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface p-6">{t('list.empty')}</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {agents.map((agent) => (
            <li key={agent.id} className="rounded-lg border border-border bg-surface p-4">
              <h2 className="text-lg font-bold">
                <Link className="link" href={`/admin/agents/${agent.id}`}>
                  <span dir="auto">
                    {localized(agent.localizations as Localizations, agent.name)}
                  </span>
                </Link>
              </h2>
              <p className="text-sm text-muted">
                {t(`categories.${agent.category}`)} · {t(`status.${agent.status}`)}
                {agent.versions[0]
                  ? ` · ${t('list.version', { version: agent.versions[0].version })}`
                  : ''}
              </p>
              <p className="mt-2 text-sm">
                {t('list.counts', { runs: agent._count.runs, files: agent._count.knowledge })}
              </p>
            </li>
          ))}
        </ul>
      )}
      <CreateAgent
        templates={AGENT_TEMPLATES.map((template) => ({
          key: template.key,
          name: template.name[locale as 'en'] ?? template.name.en,
          description: template.description[locale as 'en'] ?? template.description.en,
          category: template.category,
        }))}
      />
    </section>
  );
}
