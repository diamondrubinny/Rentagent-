import { formatMicros } from '@rentagent/ai-gateway';
import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { db } from '@/lib/server/runtime';
import { requirePermission } from '@/lib/server/session';

const DAYS = 30;

/** Start of the reporting window (computed per request). */
function windowStart(days: number): Date {
  return new Date(Date.now() - days * 24 * 3600 * 1000);
}

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'AdminAi.usage' });
  return { title: t('title') };
}

export default async function UsagePage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission(locale, 'providers.manage', '/admin/usage');
  const t = await getTranslations('AdminAi.usage');
  const format = await getFormatter();
  const since = windowStart(DAYS);

  const [rows, errors] = await Promise.all([
    db().usageRecord.groupBy({
      by: ['modelId'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      _sum: { inputTokens: true, outputTokens: true, costMicros: true, priceMicros: true },
      _avg: { latencyMs: true },
    }),
    db().usageRecord.groupBy({
      by: ['modelId'],
      where: { createdAt: { gte: since }, status: 'ERROR' },
      _count: { _all: true },
    }),
  ]);
  const errorsByModel = new Map(errors.map((row) => [row.modelId, row._count._all]));
  const models = new Map(
    (
      await db().aiModel.findMany({
        where: {
          id: { in: rows.map((row) => row.modelId).filter((id): id is string => Boolean(id)) },
        },
        select: { id: true, displayName: true, provider: { select: { name: true } } },
      })
    ).map((model) => [model.id, `${model.provider.name} · ${model.displayName}`]),
  );
  const totalCost = rows.reduce((sum, row) => sum + (row._sum.costMicros ?? 0n), 0n);
  const totalPrice = rows.reduce((sum, row) => sum + (row._sum.priceMicros ?? 0n), 0n);

  return (
    <section aria-labelledby="usage-title" className="space-y-6">
      <h1 id="usage-title" className="text-3xl font-bold">
        {t('title')}
      </h1>
      <p className="text-muted">{t('intro', { days: DAYS })}</p>
      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-4">
          <dt className="text-sm text-muted">{t('totalCost')}</dt>
          <dd className="text-2xl font-bold" dir="ltr">
            {formatMicros(totalCost, 4)} USD
          </dd>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <dt className="text-sm text-muted">{t('totalPrice')}</dt>
          <dd className="text-2xl font-bold" dir="ltr">
            {formatMicros(totalPrice, 4)}
          </dd>
        </div>
      </dl>
      {rows.length === 0 ? (
        <p>{t('empty')}</p>
      ) : (
        <div
          className="overflow-x-auto rounded-lg border border-border"
          role="region"
          aria-label={t('title')}
          tabIndex={0}
        >
          <table className="w-full text-sm">
            <caption className="sr-only">{t('title')}</caption>
            <thead className="bg-surface">
              <tr>
                <th scope="col" className="p-3 text-start">
                  {t('model')}
                </th>
                <th scope="col" className="p-3 text-end">
                  {t('calls')}
                </th>
                <th scope="col" className="p-3 text-end">
                  {t('errors')}
                </th>
                <th scope="col" className="p-3 text-end">
                  {t('tokensIn')}
                </th>
                <th scope="col" className="p-3 text-end">
                  {t('tokensOut')}
                </th>
                <th scope="col" className="p-3 text-end">
                  {t('cost')}
                </th>
                <th scope="col" className="p-3 text-end">
                  {t('latency')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.modelId ?? 'deleted'}>
                  <td className="p-3" dir="auto">
                    {(row.modelId && models.get(row.modelId)) ?? t('deleted')}
                  </td>
                  <td className="p-3 text-end">{format.number(row._count._all)}</td>
                  <td className="p-3 text-end">
                    {format.number(errorsByModel.get(row.modelId) ?? 0)}
                  </td>
                  <td className="p-3 text-end">{format.number(row._sum.inputTokens ?? 0)}</td>
                  <td className="p-3 text-end">{format.number(row._sum.outputTokens ?? 0)}</td>
                  <td className="p-3 text-end" dir="ltr">
                    {formatMicros(row._sum.costMicros ?? 0n, 4)}
                  </td>
                  <td className="p-3 text-end">
                    {format.number(Math.round(row._avg.latencyMs ?? 0))} ms
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
