import { formatMicros } from '@rentagent/ai-gateway';
import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { db } from '@/lib/server/runtime';
import { requirePermission } from '@/lib/server/session';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'AdminAgents.runs' });
  return { title: t('title') };
}

export default async function RunsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission(locale, 'agents.manage', '/admin/runs');
  const t = await getTranslations('AdminAgents');
  const format = await getFormatter();
  const runs = await db().run.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { agent: { select: { name: true } }, user: { select: { name: true } } },
  });
  return (
    <section aria-labelledby="runs-title" className="space-y-6">
      <h1 id="runs-title" className="text-3xl font-bold">
        {t('runs.title')}
      </h1>
      {runs.length === 0 ? (
        <p>{t('runs.empty')}</p>
      ) : (
        <div
          className="overflow-x-auto rounded-lg border border-border"
          role="region"
          aria-label={t('runs.title')}
          tabIndex={0}
        >
          <table className="w-full text-sm">
            <caption className="sr-only">{t('runs.title')}</caption>
            <thead className="bg-surface">
              <tr>
                <th scope="col" className="p-3 text-start">
                  {t('runs.agent')}
                </th>
                <th scope="col" className="p-3 text-start">
                  {t('runs.status')}
                </th>
                <th scope="col" className="p-3 text-start">
                  {t('runs.mode')}
                </th>
                <th scope="col" className="p-3 text-start">
                  {t('runs.by')}
                </th>
                <th scope="col" className="p-3 text-start">
                  {t('runs.feedback')}
                </th>
                <th scope="col" className="p-3 text-end">
                  {t('runs.cost')}
                </th>
                <th scope="col" className="p-3 text-start">
                  {t('runs.started')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {runs.map((run) => (
                <tr key={run.id}>
                  <td className="p-3">
                    <Link className="link" href={`/admin/runs/${run.id}`}>
                      <span dir="auto">{run.agent.name}</span>
                    </Link>
                  </td>
                  <td className="p-3">{t(`runStatus.${run.status}`)}</td>
                  <td className="p-3">{t(`runs.mode_${run.mode}`)}</td>
                  <td className="p-3" dir="auto">
                    {run.user?.name ?? '—'}
                  </td>
                  <td className="p-3">
                    {run.rating === 1
                      ? t('runs.helpful')
                      : run.rating === -1
                        ? t('runs.notHelpful')
                        : '—'}
                    {run.feedback && (
                      <span
                        className="block max-w-xs truncate text-muted"
                        dir="auto"
                        title={run.feedback}
                      >
                        {run.feedback}
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-end" dir="ltr">
                    {formatMicros(run.costMicros, 4)} USD
                  </td>
                  <td className="p-3">
                    {format.dateTime(run.createdAt, { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
