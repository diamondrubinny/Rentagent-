import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { db } from '@/lib/server/runtime';
import { requirePermission } from '@/lib/server/session';
import { PolicyEditor } from './policy-editor';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'AdminAi.routing' });
  return { title: t('title') };
}

export default async function RoutingPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission(locale, 'providers.manage', '/admin/routing');
  const t = await getTranslations('AdminAi.routing');
  const [policies, models] = await Promise.all([
    db().routingPolicy.findMany({ orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] }),
    db().aiModel.findMany({
      where: { kind: 'CHAT' },
      orderBy: [{ provider: { name: 'asc' } }, { displayName: 'asc' }],
      select: {
        id: true,
        displayName: true,
        enabled: true,
        provider: { select: { name: true, enabled: true } },
      },
    }),
  ]);
  const modelOptions = models.map((model) => ({
    id: model.id,
    label: `${model.provider.name} · ${model.displayName}`,
    available: model.enabled && model.provider.enabled,
  }));

  return (
    <section aria-labelledby="routing-title" className="space-y-8">
      <h1 id="routing-title" className="text-3xl font-bold">
        {t('title')}
      </h1>
      <p className="text-muted">{t('intro')}</p>
      {modelOptions.length === 0 && (
        <p className="rounded-lg border border-border bg-surface p-4">{t('noModels')}</p>
      )}
      {policies.map((policy) => (
        <PolicyEditor
          key={policy.id}
          policy={{
            id: policy.id,
            name: policy.name,
            strategy: policy.strategy,
            modelIds: policy.modelIds,
            isDefault: policy.isDefault,
          }}
          models={modelOptions}
        />
      ))}
      {modelOptions.length > 0 && <PolicyEditor policy={null} models={modelOptions} />}
    </section>
  );
}
