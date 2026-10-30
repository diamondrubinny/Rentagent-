import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { apiUsageLast30Days } from '@/lib/server/api-keys';
import { getBranding } from '@/lib/server/branding';
import { db } from '@/lib/server/runtime';
import { requirePermission } from '@/lib/server/session';
import { AdminRevokeButton } from './revoke-button';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'ApiKeys' });
  return { title: t('adminTitle') };
}

export default async function AdminApiKeysPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission(locale, 'users.manage', '/admin/api-keys');
  const [t, format, keys, counts, enabled] = await Promise.all([
    getTranslations('ApiKeys'),
    getFormatter(),
    db().apiKey.findMany({
      where: { revokedAt: null },
      orderBy: [{ lastUsedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 200,
      include: { user: { select: { email: true } } },
    }),
    apiUsageLast30Days(),
    getBranding().then(({ features }) => features.publicApi),
  ]);
  const date = (value: Date | null) =>
    value ? format.dateTime(value, { dateStyle: 'medium', timeStyle: 'short' }) : t('never');
  return (
    <section aria-labelledby="admin-keys-title" className="space-y-6">
      <div>
        <h1 id="admin-keys-title" className="text-3xl font-bold">
          {t('adminTitle')}
        </h1>
        <p className="mt-2 text-muted">{enabled ? t('adminIntro') : t('adminDisabled')}</p>
      </div>
      {keys.length === 0 ? (
        <p>{t('adminEmpty')}</p>
      ) : (
        <div
          className="overflow-x-auto"
          role="region"
          aria-labelledby="admin-keys-title"
          tabIndex={0}
        >
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-start">
                <th scope="col" className="p-2 text-start">
                  {t('name')}
                </th>
                <th scope="col" className="p-2 text-start">
                  {t('owner')}
                </th>
                <th scope="col" className="p-2 text-start">
                  {t('lastUsed')}
                </th>
                <th scope="col" className="p-2 text-start">
                  {t('conversations30')}
                </th>
                <th scope="col" className="p-2 text-start">
                  {t('expires')}
                </th>
                <th scope="col" className="p-2 text-start">
                  <span className="sr-only">{t('actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id} className="border-b border-border">
                  <th scope="row" className="p-2 text-start font-normal" id={`admin-key-${key.id}`}>
                    <span dir="auto">{key.name}</span>{' '}
                    <span className="font-mono text-muted" dir="ltr">
                      ra_sk_{key.keyId.slice(0, 8)}…
                    </span>
                  </th>
                  <td className="p-2" dir="ltr">
                    {key.user.email}
                  </td>
                  <td className="p-2">{date(key.lastUsedAt)}</td>
                  <td className="p-2">{counts.get(key.id) ?? 0}</td>
                  <td className="p-2">{key.expiresAt ? date(key.expiresAt) : t('expiryNever')}</td>
                  <td className="p-2">
                    <AdminRevokeButton id={key.id} describedBy={`admin-key-${key.id}`} />
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
