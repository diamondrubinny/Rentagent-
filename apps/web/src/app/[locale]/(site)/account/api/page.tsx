import { getServerEnv } from '@rentagent/core';
import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { getBranding } from '@/lib/server/branding';
import { runnableAgents } from '@/lib/server/catalog';
import { db } from '@/lib/server/runtime';
import { requireUser } from '@/lib/server/session';
import { CreateKeyForm, CreateWidgetForm, RevokeKeyButton, WidgetSnippet } from './api-key-forms';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'ApiKeys' });
  return { title: t('title') };
}

export default async function ApiKeysPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, '/account/api');
  if (!(await getBranding()).features.publicApi) notFound();
  const [t, format, keys, agents] = await Promise.all([
    getTranslations('ApiKeys'),
    getFormatter(),
    db().apiKey.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }),
    runnableAgents(locale),
  ]);
  const agentNames = new Map(agents.map((agent) => [agent.id, agent.name]));
  const now = new Date();
  const date = (value: Date | null) =>
    value ? format.dateTime(value, { dateStyle: 'medium' }) : t('never');
  const siteUrl = getServerEnv().APP_URL.replace(/\/$/, '');
  const base = `${siteUrl}/api/v1`;
  const example = `curl ${base}/agents \\\n  -H "Authorization: Bearer ra_sk_…"`;

  return (
    <div className="max-w-3xl space-y-10">
      <div>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="mt-2">{t('intro')}</p>
        <p className="mt-2 text-sm text-muted">{t('billingNote')}</p>
      </div>

      <section aria-labelledby="keys-title" className="space-y-4">
        <h2 id="keys-title" className="text-xl font-bold">
          {t('yourKeys')}
        </h2>
        {keys.length === 0 ? (
          <p>{t('empty')}</p>
        ) : (
          <ul className="space-y-4">
            {keys.map((key) => {
              const status = key.revokedAt
                ? t('statusRevoked')
                : key.expiresAt && key.expiresAt <= now
                  ? t('statusExpired')
                  : t('statusActive');
              return (
                <li key={key.id} className="space-y-2 rounded-lg border border-border p-4">
                  <p className="font-semibold" id={`key-${key.id}`} dir="auto">
                    {key.name}
                  </p>
                  <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[10rem_1fr]">
                    <dt className="text-muted">{t('keyStart')}</dt>
                    <dd className="font-mono" dir="ltr">
                      {key.kind === 'PUBLISHABLE'
                        ? `ra_pk_${key.keyId}`
                        : `ra_sk_${key.keyId.slice(0, 8)}…`}
                    </dd>
                    <dt className="text-muted">{t('type')}</dt>
                    <dd>{key.kind === 'PUBLISHABLE' ? t('typeWidget') : t('typeSecret')}</dd>
                    <dt className="text-muted">{t('status')}</dt>
                    <dd>{status}</dd>
                    {key.kind === 'PUBLISHABLE' ? (
                      <>
                        <dt className="text-muted">{t('widgetOrigins')}</dt>
                        <dd className="font-mono" dir="ltr">
                          {key.origins.join(', ')}
                        </dd>
                        <dt className="text-muted">{t('widgetDailyLimit')}</dt>
                        <dd>{key.dailyRunLimit}</dd>
                      </>
                    ) : (
                      <>
                        <dt className="text-muted">{t('scopes')}</dt>
                        <dd className="font-mono" dir="ltr">
                          {key.scopes.join(', ')}
                        </dd>
                      </>
                    )}
                    <dt className="text-muted">{t('agents')}</dt>
                    <dd>
                      {key.agentIds.length
                        ? key.agentIds.map((id) => agentNames.get(id) ?? '—').join(', ')
                        : t('allAgents')}
                    </dd>
                    <dt className="text-muted">{t('created')}</dt>
                    <dd>{date(key.createdAt)}</dd>
                    <dt className="text-muted">{t('lastUsed')}</dt>
                    <dd>{date(key.lastUsedAt)}</dd>
                    <dt className="text-muted">{t('expires')}</dt>
                    <dd>{key.expiresAt ? date(key.expiresAt) : t('expiryNever')}</dd>
                  </dl>
                  {!key.revokedAt && key.kind === 'PUBLISHABLE' && (
                    <WidgetSnippet token={`ra_pk_${key.keyId}`} siteUrl={siteUrl} locale={locale} />
                  )}
                  {!key.revokedAt && <RevokeKeyButton id={key.id} describedBy={`key-${key.id}`} />}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="create-key-title" className="space-y-4">
        <h2 id="create-key-title" className="text-xl font-bold">
          {t('createTitle')}
        </h2>
        <CreateKeyForm agents={agents.map((agent) => ({ id: agent.id, name: agent.name }))} />
      </section>

      {agents.length > 0 && (
        <section aria-labelledby="create-widget-title" className="space-y-4">
          <h2 id="create-widget-title" className="text-xl font-bold">
            {t('widgetTitle')}
          </h2>
          <p>{t('widgetIntro')}</p>
          <CreateWidgetForm
            agents={agents.map((agent) => ({ id: agent.id, name: agent.name }))}
            siteUrl={siteUrl}
            locale={locale}
          />
        </section>
      )}

      <section aria-labelledby="api-docs-title" className="space-y-3">
        <h2 id="api-docs-title" className="text-xl font-bold">
          {t('docsTitle')}
        </h2>
        <p>{t('docsBody')}</p>
        <pre className="overflow-x-auto rounded-lg bg-surface p-4 text-sm" dir="ltr" tabIndex={0}>
          <code>{example}</code>
        </pre>
        <p>
          <a className="link" href="/api/v1/openapi.json">
            {t('openapi')}
          </a>
        </p>
      </section>
    </div>
  );
}
