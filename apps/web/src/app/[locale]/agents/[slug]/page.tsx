import { BUILTIN_TOOLS } from '@rentagent/shared';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { runnableAgent } from '@/lib/server/catalog';
import { db } from '@/lib/server/runtime';
import { getCurrentUser, requireUser } from '@/lib/server/session';
import { getSiteConfig } from '@/lib/server/site';
import { StartForm } from './start-form';

interface PageProps {
  params: Promise<{ locale: string; slug: string }>;
}

const slugPattern = /^[a-z0-9-]{1,80}$/;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  // A private catalog reveals nothing to visitors, not even in the page title.
  if (!(await getSiteConfig()).catalogPublic && !(await getCurrentUser())) return {};
  const agent = slugPattern.test(slug) ? await runnableAgent({ slug }, locale) : null;
  if (!agent) return {};
  return {
    title: agent.name,
    description: agent.description.slice(0, 160),
    openGraph: { title: agent.name, description: agent.description.slice(0, 200) },
  };
}

/** Human-readable list of what the agent can do, and which actions need the user's approval. */
async function capabilities(tools: { id: string; approval: string }[]) {
  const t = await getTranslations('Catalog.tools');
  const httpIds = tools
    .filter((tool) => tool.id.startsWith('http:'))
    .map((tool) => tool.id.slice(5));
  const mcpIds = tools.filter((tool) => tool.id.startsWith('mcp:')).map((tool) => tool.id.slice(4));
  const [http, mcp] = await Promise.all([
    db().httpTool.findMany({
      where: { id: { in: httpIds } },
      select: { id: true, description: true },
    }),
    db().mcpServer.findMany({ where: { id: { in: mcpIds } }, select: { id: true, name: true } }),
  ]);
  return tools.flatMap((tool) => {
    let label: string | undefined;
    if ((BUILTIN_TOOLS as readonly string[]).includes(tool.id)) label = t(tool.id);
    else if (tool.id.startsWith('http:'))
      label = http.find((row) => row.id === tool.id.slice(5))?.description;
    else {
      const server = mcp.find((row) => row.id === tool.id.slice(4));
      label = server ? t('mcp', { name: server.name }) : undefined;
    }
    return label ? [{ id: tool.id, label, approval: tool.approval === 'always' }] : [];
  });
}

export default async function AgentPage({ params }: PageProps) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const site = await getSiteConfig();
  if (!site.catalogPublic) await requireUser(locale, `/agents/${slug}`);
  if (!slugPattern.test(slug)) notFound();
  const agent = await runnableAgent({ slug }, locale);
  if (!agent) notFound();
  const user = await getCurrentUser();
  const t = await getTranslations('Catalog');
  const items = await capabilities(agent.config.tools);

  return (
    <div className="space-y-8">
      <p>
        <Link className="link" href="/agents">
          {t('backToCatalog')}
        </Link>
      </p>
      <div>
        <p className="text-sm text-muted">{t(`categories.${agent.category}`)}</p>
        <h1 className="text-3xl font-bold" dir="auto">
          {agent.name}
        </h1>
        <p className="mt-3 whitespace-pre-line text-lg" dir="auto">
          {agent.description}
        </p>
      </div>

      <section
        aria-labelledby="agent-capabilities"
        className="rounded-lg border border-border bg-surface p-4"
      >
        <h2 id="agent-capabilities" className="text-xl font-bold">
          {t('capabilities')}
        </h2>
        {items.length === 0 ? (
          <p className="mt-2">{t('noTools')}</p>
        ) : (
          <ul className="mt-2 list-disc space-y-1 ps-6">
            {items.map((item) => (
              <li key={item.id} dir="auto">
                {item.label}
                {item.approval && <strong className="ms-1">({t('needsApproval')})</strong>}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-sm text-muted">{t('aiNotice')}</p>
      </section>

      <section aria-labelledby="agent-start">
        <h2 id="agent-start" className="text-xl font-bold">
          {t('startTitle')}
        </h2>
        {user ? (
          <StartForm slug={agent.slug} locale={locale} fields={agent.config.inputFields} />
        ) : (
          <p className="mt-3 rounded-lg border border-border p-4">
            {t.rich('signInToStart', {
              link: (chunks) => (
                <Link
                  className="link"
                  href={{
                    pathname: '/sign-in',
                    query: { next: `/${locale}/agents/${agent.slug}` },
                  }}
                >
                  {chunks}
                </Link>
              ),
            })}
          </p>
        )}
      </section>
    </div>
  );
}
