import { PROVIDER_TYPES, PROVIDERS, type ProviderTypeName } from '@rentagent/ai-gateway';
import { getSetting } from '@rentagent/db';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { db } from '@/lib/server/runtime';
import { requirePermission } from '@/lib/server/session';
import { AddProviderForm } from './add-provider-form';
import { KillSwitch } from './kill-switch';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'AdminAi.providers' });
  return { title: t('title') };
}

export default async function ProvidersPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission(locale, 'providers.manage', '/admin/providers');
  const t = await getTranslations('AdminAi.providers');

  const [providers, disabled] = await Promise.all([
    db().provider.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        _count: {
          select: { keys: { where: { enabled: true } }, models: { where: { enabled: true } } },
        },
        keys: { where: { lastErrorKind: { not: null } }, select: { id: true } },
      },
    }),
    getSetting(db(), 'ai.disabled'),
  ]);

  return (
    <section aria-labelledby="providers-title" className="space-y-8">
      <h1 id="providers-title" className="text-3xl font-bold">
        {t('title')}
      </h1>
      <p className="text-muted">{t('intro')}</p>

      <KillSwitch disabled={Boolean(disabled)} />

      {providers.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface p-6">{t('empty')}</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {providers.map((provider) => (
            <li key={provider.id} className="rounded-lg border border-border bg-surface p-4">
              <h2 className="text-lg font-bold">
                <Link className="link" href={`/admin/providers/${provider.id}`}>
                  <span dir="auto">{provider.name}</span>
                </Link>
              </h2>
              <p className="text-sm text-muted">
                {PROVIDERS[provider.type as ProviderTypeName].label}
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-1 text-sm">
                <dt>{t('status')}</dt>
                <dd className="font-semibold">{provider.enabled ? t('enabled') : t('disabled')}</dd>
                <dt>{t('activeKeys')}</dt>
                <dd>{provider._count.keys}</dd>
                <dt>{t('activeModels')}</dt>
                <dd>{provider._count.models}</dd>
              </dl>
              {provider.keys.length > 0 && (
                <p className="mt-2 text-sm font-semibold text-danger">
                  {t('keyErrors', { count: provider.keys.length })}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <section aria-labelledby="add-provider-title" className="rounded-lg border border-border p-6">
        <h2 id="add-provider-title" className="text-2xl font-bold">
          {t('addTitle')}
        </h2>
        <AddProviderForm
          types={PROVIDER_TYPES.map((type) => ({
            type,
            label: PROVIDERS[type].label,
            defaultBaseUrl: PROVIDERS[type].defaultBaseUrl ?? '',
            baseUrlRequired: PROVIDERS[type].baseUrlRequired,
            settings: PROVIDERS[type].settings,
          }))}
        />
      </section>
    </section>
  );
}
