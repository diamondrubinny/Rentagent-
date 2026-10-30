import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { db } from '@/lib/server/runtime';
import { requirePermission } from '@/lib/server/session';
import { HttpToolForm, McpServerForm } from './tool-forms';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'AdminTools' });
  return { title: t('title') };
}

export default async function ToolsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission(locale, 'settings.manage', '/admin/tools');
  const t = await getTranslations('AdminTools');
  const format = await getFormatter();
  const [httpTools, servers] = await Promise.all([
    db().httpTool.findMany({ orderBy: { name: 'asc' } }),
    db().mcpServer.findMany({ orderBy: { name: 'asc' } }),
  ]);
  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="mt-2 text-muted">{t('intro')}</p>
      </div>

      <section aria-labelledby="http-title" className="space-y-4">
        <h2 id="http-title" className="text-2xl font-bold">
          {t('http.title')}
        </h2>
        <p className="text-muted">{t('http.intro')}</p>
        {httpTools.map((tool) => (
          <details key={tool.id} className="rounded-lg border border-border">
            <summary className="cursor-pointer p-3 font-semibold">
              <code dir="ltr">{tool.name}</code> · {tool.method} ·{' '}
              {tool.enabled ? t('enabled') : t('disabled')}
            </summary>
            <HttpToolForm
              tool={{
                id: tool.id,
                name: tool.name,
                description: tool.description,
                method: tool.method,
                urlTemplate: tool.urlTemplate,
                inputSchema: JSON.stringify(tool.inputSchema, null, 2),
                hasHeaders: Boolean(tool.headersEncrypted),
                enabled: tool.enabled,
              }}
            />
          </details>
        ))}
        <details className="rounded-lg border border-border bg-surface">
          <summary className="cursor-pointer p-3 font-semibold">{t('http.add')}</summary>
          <HttpToolForm tool={null} />
        </details>
      </section>

      <section aria-labelledby="mcp-title" className="space-y-4">
        <h2 id="mcp-title" className="text-2xl font-bold">
          {t('mcp.title')}
        </h2>
        <p className="text-muted">{t('mcp.intro')}</p>
        {servers.map((server) => (
          <details key={server.id} className="rounded-lg border border-border">
            <summary className="cursor-pointer p-3 font-semibold">
              <span dir="auto">{server.name}</span> ·{' '}
              {t('mcp.toolCount', { count: (server.toolCache as unknown[]).length })}
              {server.toolCacheUpdatedAt &&
                ` · ${format.dateTime(server.toolCacheUpdatedAt, { dateStyle: 'short', timeStyle: 'short' })}`}
            </summary>
            <McpServerForm
              server={{
                id: server.id,
                name: server.name,
                slug: server.slug,
                url: server.url,
                hasAuth: Boolean(server.authEncrypted),
                enabled: server.enabled,
                tools: (server.toolCache as { name: string; description?: string }[]).map(
                  (tool) => tool.name,
                ),
              }}
            />
          </details>
        ))}
        <details className="rounded-lg border border-border bg-surface">
          <summary className="cursor-pointer p-3 font-semibold">{t('mcp.add')}</summary>
          <McpServerForm server={null} />
        </details>
      </section>
    </div>
  );
}
