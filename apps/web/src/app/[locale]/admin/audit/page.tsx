import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { db } from '@/lib/server/runtime';
import { requirePermission } from '@/lib/server/session';

const PAGE_SIZE = 50;
const ACTION_GROUPS = ['auth', 'admin', 'ai', 'setup', 'settings'] as const;

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ group?: string; page?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Admin.audit' });
  return { title: t('title') };
}

export default async function AdminAuditPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const query = await searchParams;
  setRequestLocale(locale);
  await requirePermission(locale, 'audit.read', '/admin/audit');
  const t = await getTranslations('Admin.audit');
  const format = await getFormatter();

  const group = ACTION_GROUPS.find((candidate) => candidate === query.group);
  const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);
  const where = group ? { action: { startsWith: `${group}.` } } : {};
  const [total, entries] = await Promise.all([
    db().auditLog.count({ where }),
    db().auditLog.findMany({
      where,
      orderBy: { id: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  const actorIds = [
    ...new Set(entries.map((entry) => entry.actorId).filter((id): id is string => Boolean(id))),
  ];
  const actors = new Map(
    (
      await db().user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true, email: true },
      })
    ).map((user) => [user.id, user]),
  );
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageLink = (target: number) => ({
    pathname: '/admin/audit' as const,
    query: { ...(group ? { group } : {}), page: target },
  });

  return (
    <section aria-labelledby="audit-title" className="space-y-6">
      <h1 id="audit-title" className="text-3xl font-bold">
        {t('title')}
      </h1>
      <p className="text-muted">{t('intro')}</p>

      <nav aria-label={t('filter')} className="flex flex-wrap gap-3">
        <Link
          className={group ? 'link' : 'font-bold'}
          href="/admin/audit"
          aria-current={group ? undefined : 'page'}
        >
          {t('all')}
        </Link>
        {ACTION_GROUPS.map((name) => (
          <Link
            key={name}
            className={group === name ? 'font-bold' : 'link'}
            href={{ pathname: '/admin/audit', query: { group: name } }}
            aria-current={group === name ? 'page' : undefined}
          >
            {t(`groups.${name}`)}
          </Link>
        ))}
      </nav>

      {/* Focusable so keyboard users can scroll wide tables horizontally. */}
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
                {t('time')}
              </th>
              <th scope="col" className="p-3 text-start">
                {t('action')}
              </th>
              <th scope="col" className="p-3 text-start">
                {t('actor')}
              </th>
              <th scope="col" className="p-3 text-start">
                {t('target')}
              </th>
              <th scope="col" className="p-3 text-start">
                {t('details')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {entries.map((entry) => {
              const actor = entry.actorId ? actors.get(entry.actorId) : undefined;
              return (
                <tr key={entry.id.toString()}>
                  <td className="whitespace-nowrap p-3">
                    {format.dateTime(entry.createdAt, { dateStyle: 'short', timeStyle: 'medium' })}
                  </td>
                  <td className="p-3 font-mono" dir="ltr">
                    {entry.action}
                  </td>
                  <td className="p-3">
                    {actor ? (
                      <span dir="auto">{actor.name}</span>
                    ) : (
                      <span className="text-muted">{t('system')}</span>
                    )}
                  </td>
                  <td className="p-3 font-mono" dir="ltr">
                    {entry.target ?? '—'}
                  </td>
                  <td className="p-3 font-mono text-xs" dir="ltr">
                    {entry.meta ? JSON.stringify(entry.meta) : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {entries.length === 0 && <p>{t('empty')}</p>}

      {pages > 1 && (
        <nav aria-label={t('pagination')} className="flex items-center gap-4">
          {page > 1 && (
            <Link className="link" href={pageLink(page - 1)}>
              {t('previous')}
            </Link>
          )}
          <span>{t('pageOf', { page, pages })}</span>
          {page < pages && (
            <Link className="link" href={pageLink(page + 1)}>
              {t('next')}
            </Link>
          )}
        </nav>
      )}
    </section>
  );
}
