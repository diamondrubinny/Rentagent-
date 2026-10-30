import {
  agentConfigSchema,
  AGENT_CATEGORIES,
  SUPPORTED_LOCALES,
  defaultAgentConfig,
  getLocaleNativeName,
} from '@rentagent/shared';
import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { Link } from '@/i18n/navigation';
import { getEnabledLocales } from '@/lib/server/locales';
import { db } from '@/lib/server/runtime';
import { requirePermission } from '@/lib/server/session';
import { ConfigForm } from './config-form';
import { KnowledgeSection } from './knowledge-section';
import { MetaForm } from './meta-form';
import { PublishPanel } from './publish-panel';

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

async function load(id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  return db().agent.findUnique({
    where: { id },
    include: {
      versions: { orderBy: { version: 'desc' }, take: 20 },
      knowledge: {
        orderBy: { createdAt: 'desc' },
        include: { file: { select: { originalName: true, size: true, scanStatus: true } } },
      },
    },
  });
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: (await load(id))?.name ?? 'Agent' };
}

export default async function AgentPage({ params }: PageProps) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requirePermission(locale, 'agents.manage', `/admin/agents/${id}`);
  const agent = await load(id);
  if (!agent) notFound();
  const t = await getTranslations('AdminAgents.builder');
  const format = await getFormatter();

  const [policies, models, httpTools, mcpServers, embeddingSetting] = await Promise.all([
    db().routingPolicy.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db().aiModel.findMany({
      where: { kind: 'CHAT', enabled: true, provider: { enabled: true } },
      orderBy: { displayName: 'asc' },
      select: { id: true, displayName: true, provider: { select: { name: true } } },
    }),
    db().httpTool.findMany({
      where: { enabled: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, method: true },
    }),
    db().mcpServer.findMany({
      where: { enabled: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, toolCache: true },
    }),
    db().setting.findUnique({ where: { key: 'ai.embeddingModelId' } }),
  ]);
  const parsedDraft = agentConfigSchema.safeParse(agent.draft);
  const draft = parsedDraft.success ? parsedDraft.data : defaultAgentConfig();
  const published = agent.versions.find((version) => version.id === agent.publishedVersionId);

  return (
    <div className="space-y-12">
      <div>
        <p>
          <Link className="link" href="/admin/agents">
            {t('back')}
          </Link>
        </p>
        <h1 className="mt-2 text-3xl font-bold" dir="auto">
          {agent.name}
        </h1>
        <p className="text-muted" dir="ltr">
          /{agent.slug}
        </p>
      </div>

      <PublishPanel
        agentId={agent.id}
        slug={agent.slug}
        featured={agent.featured}
        status={agent.status}
        publishedVersion={published?.version ?? null}
        versions={agent.versions.map((version) => ({
          id: version.id,
          version: version.version,
          note: version.note,
          createdAt: format.dateTime(version.createdAt, {
            dateStyle: 'medium',
            timeStyle: 'short',
          }),
          isPublished: version.id === agent.publishedVersionId,
        }))}
      />

      <section aria-labelledby="meta-title">
        <h2 id="meta-title" className="text-2xl font-bold">
          {t('metaTitle')}
        </h2>
        <MetaForm
          agentId={agent.id}
          categories={[...AGENT_CATEGORIES]}
          locales={(await getEnabledLocales())
            .filter(({ code }) => code !== 'en')
            .map(({ code, nativeName }) => ({ code, name: nativeName }))}
          values={{
            slug: agent.slug,
            name: agent.name,
            category: agent.category,
            description: agent.description,
            localizations: agent.localizations as Record<
              string,
              { name: string; description: string }
            >,
          }}
        />
      </section>

      <section aria-labelledby="config-title">
        <h2 id="config-title" className="text-2xl font-bold">
          {t('configTitle')}
        </h2>
        {!parsedDraft.success && (
          <p className="mt-2 font-semibold text-danger">{t('draftInvalid')}</p>
        )}
        <ConfigForm
          agentId={agent.id}
          initial={draft}
          targets={[
            ...policies.map((policy) => ({
              value: `policy:${policy.id}`,
              label: `${t('policy')}: ${policy.name}`,
            })),
            ...models.map((model) => ({
              value: `model:${model.id}`,
              label: `${model.provider.name} · ${model.displayName}`,
            })),
          ]}
          customTools={[
            ...httpTools.map((tool) => ({
              id: `http:${tool.id}`,
              label: `${tool.name} (HTTP ${tool.method})`,
              sideEffect: tool.method !== 'GET',
            })),
            ...mcpServers.map((server) => ({
              id: `mcp:${server.id}`,
              label: `${server.name} (MCP, ${t('mcpToolCount', { count: (server.toolCache as unknown[]).length })})`,
              sideEffect: true,
            })),
          ]}
          locales={SUPPORTED_LOCALES.map((code) => ({ code, name: getLocaleNativeName(code) }))}
        />
      </section>

      <section aria-labelledby="knowledge-title">
        <h2 id="knowledge-title" className="text-2xl font-bold">
          {t('knowledgeTitle')}
        </h2>
        <KnowledgeSection
          agentId={agent.id}
          embeddingConfigured={Boolean(embeddingSetting)}
          sources={agent.knowledge.map((source) => ({
            id: source.id,
            name: source.file.originalName,
            size: source.file.size,
            scanStatus: source.file.scanStatus,
            status: source.status,
            error: source.error,
            chunks: source.chunkCount,
          }))}
        />
      </section>
    </div>
  );
}
