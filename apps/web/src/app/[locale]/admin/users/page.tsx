import { canAssignRole, canManageUser, isRole, ROLES } from '@rentagent/shared';
import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { db } from '@/lib/server/runtime';
import { requirePermission } from '@/lib/server/session';
import { UserActions } from './user-actions';

const PAGE_SIZE = 20;

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Admin.users' });
  return { title: t('title') };
}

export default async function AdminUsersPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const query = await searchParams;
  setRequestLocale(locale);
  const actor = await requirePermission(locale, 'users.read', '/admin/users');
  const t = await getTranslations('Admin.users');
  const tRoles = await getTranslations('Roles');
  const format = await getFormatter();

  const search = (query.q ?? '').trim().slice(0, 100);
  const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);
  const where = search
    ? {
        OR: [
          { email: { contains: search, mode: 'insensitive' as const } },
          { name: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : {};
  const [total, users] = await Promise.all([
    db().user.count({ where }),
    db().user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        emailVerified: true,
        twoFactorEnabled: true,
        createdAt: true,
      },
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section aria-labelledby="users-title" className="space-y-6">
      <h1 id="users-title" className="text-3xl font-bold">
        {t('title')}
      </h1>

      <form role="search" className="flex flex-wrap items-end gap-2">
        <div className="grow">
          <label htmlFor="user-search" className="mb-1 block font-semibold">
            {t('search')}
          </label>
          <input
            id="user-search"
            name="q"
            type="search"
            defaultValue={search}
            className="field-input"
            dir="auto"
          />
        </div>
        <button type="submit" className="btn btn-secondary">
          {t('searchButton')}
        </button>
      </form>

      <p role="status">{t('count', { count: total })}</p>

      {/* Focusable so keyboard users can scroll wide tables horizontally. */}
      <div
        className="overflow-x-auto rounded-lg border border-border"
        role="region"
        aria-label={t('title')}
        tabIndex={0}
      >
        <table className="w-full text-start text-sm">
          <caption className="sr-only">{t('title')}</caption>
          <thead className="bg-surface">
            <tr>
              <th scope="col" className="p-3 text-start">
                {t('name')}
              </th>
              <th scope="col" className="p-3 text-start">
                {t('role')}
              </th>
              <th scope="col" className="p-3 text-start">
                {t('status')}
              </th>
              <th scope="col" className="p-3 text-start">
                {t('security')}
              </th>
              <th scope="col" className="p-3 text-start">
                {t('created')}
              </th>
              <th scope="col" className="p-3 text-start">
                {t('actions')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((user) => {
              const target = {
                id: user.id,
                role: isRole(user.role) ? user.role : ('USER' as const),
              };
              const manageable = canManageUser(actor, target);
              return (
                <tr key={user.id}>
                  <td className="p-3">
                    <span className="block font-semibold" dir="auto">
                      {user.name}
                    </span>
                    <span className="block text-muted" dir="ltr">
                      {user.email}
                    </span>
                  </td>
                  <td className="p-3">{tRoles(target.role)}</td>
                  <td className="p-3">
                    {user.status === 'ACTIVE' ? t('active') : t('disabledStatus')}
                    {!user.emailVerified && (
                      <span className="block text-muted">{t('unverified')}</span>
                    )}
                  </td>
                  <td className="p-3">
                    {user.twoFactorEnabled ? t('twoFactorOn') : t('twoFactorOff')}
                  </td>
                  <td className="p-3">
                    {format.dateTime(user.createdAt, { dateStyle: 'medium' })}
                  </td>
                  <td className="p-3">
                    {manageable ? (
                      <UserActions
                        userId={user.id}
                        userLabel={user.name}
                        role={target.role}
                        status={user.status}
                        roleOptions={ROLES.filter(
                          (role) => role === target.role || canAssignRole(actor, target, role),
                        ).map((role) => ({ value: role, label: tRoles(role) }))}
                      />
                    ) : (
                      <span className="text-muted">{actor.id === user.id ? t('you') : '—'}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <nav aria-label={t('pagination')} className="flex items-center gap-4">
          {page > 1 && (
            <Link
              className="link"
              href={{ pathname: '/admin/users', query: { q: search, page: page - 1 } }}
            >
              {t('previous')}
            </Link>
          )}
          <span>{t('pageOf', { page, pages })}</span>
          {page < pages && (
            <Link
              className="link"
              href={{ pathname: '/admin/users', query: { q: search, page: page + 1 } }}
            >
              {t('next')}
            </Link>
          )}
        </nav>
      )}
    </section>
  );
}
