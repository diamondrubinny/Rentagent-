import { agentConfigSchema, BUILTIN_TOOLS, localizedAgent } from '@rentagent/shared';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { Link } from '@/i18n/navigation';
import { runnableAgent } from '@/lib/server/catalog';
import { db } from '@/lib/server/runtime';
import { requireUser } from '@/lib/server/session';
import { ConversationView, type Turn } from './conversation-view';

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Chat' });
  return { title: t('conversation'), robots: { index: false } };
}

/** Labels for tool names the user may see in activity lines and approval requests. */
async function toolLabels(): Promise<{
  tools: Record<string, string>;
  mcp: Record<string, string>;
}> {
  const t = await getTranslations('Catalog.tools');
  const [http, servers] = await Promise.all([
    db().httpTool.findMany({ select: { name: true, description: true } }),
    db().mcpServer.findMany({ select: { slug: true, name: true } }),
  ]);
  return {
    tools: {
      ...Object.fromEntries(BUILTIN_TOOLS.map((name) => [name, t(name)])),
      ...Object.fromEntries(http.map((tool) => [tool.name, tool.description || tool.name])),
    },
    mcp: Object.fromEntries(servers.map((server) => [server.slug, server.name])),
  };
}

export default async function ConversationPage({ params }: PageProps) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, `/chats/${id}`);
  if (!z.uuid().safeParse(id).success) notFound();
  // Ownership is part of the query: other users' conversations do not exist here.
  const conversation = await db().conversation.findFirst({
    where: { id, userId: user.id },
    include: {
      agent: {
        select: { id: true, slug: true, name: true, description: true, localizations: true },
      },
      runs: {
        orderBy: { createdAt: 'asc' },
        include: {
          approvals: { where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' } },
          steps: {
            where: { type: 'TOOL' },
            orderBy: { idx: 'asc' },
            select: { toolName: true, ok: true },
          },
        },
      },
    },
  });
  if (!conversation) notFound();
  const t = await getTranslations('Chat');
  const agentName = localizedAgent(conversation.agent, locale).name;
  const runnable = await runnableAgent({ id: conversation.agent.id }, locale);

  const turns: Turn[] = conversation.runs.map((run) => {
    const config = agentConfigSchema.safeParse(run.config);
    const fields = config.success ? config.data.inputFields : [];
    const input = (run.input ?? {}) as Record<string, unknown>;
    return {
      id: run.id,
      userText: run.userMessage,
      userFields:
        run.userMessage === null
          ? fields
              .filter((field) => input[field.key] !== undefined && input[field.key] !== '')
              .map((field) => ({ label: field.label, value: String(input[field.key]) }))
          : [],
      status: run.status,
      output: run.output,
      errorKind: run.errorKind,
      rating: run.rating,
      feedback: run.feedback,
      approvals: run.approvals.map((approval) => ({
        id: approval.id,
        toolName: approval.toolName,
        input: approval.input,
        status: approval.status,
      })),
      tools: run.steps.map((step) => ({ toolName: step.toolName ?? '', ok: step.ok })),
    };
  });

  return (
    <div className="space-y-6">
      <p className="no-print flex flex-wrap gap-4">
        <Link className="link" href="/chats">
          {t('allChats')}
        </Link>
        <Link className="link" href={`/agents/${conversation.agent.slug}`}>
          {t('agentPage', { name: agentName })}
        </Link>
      </p>
      <ConversationView
        conversation={{ id: conversation.id, title: conversation.title }}
        agentName={agentName}
        locale={locale}
        turns={turns}
        followUp={
          !runnable
            ? 'agentUnavailable'
            : runnable.config.conversation.followUps
              ? 'allowed'
              : 'disabled'
        }
        labels={await toolLabels()}
      />
    </div>
  );
}
