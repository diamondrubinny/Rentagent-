import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { db } from '@/lib/server/runtime';
import { requirePermission } from '@/lib/server/session';
import { Playground } from './playground';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'AdminAi.playground' });
  return { title: t('title') };
}

export default async function PlaygroundPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission(locale, 'providers.manage', '/admin/playground');
  const t = await getTranslations('AdminAi.playground');
  const [models, policies] = await Promise.all([
    db().aiModel.findMany({
      where: { kind: 'CHAT', enabled: true, provider: { enabled: true } },
      orderBy: [{ provider: { name: 'asc' } }, { displayName: 'asc' }],
      select: { id: true, displayName: true, provider: { select: { name: true } } },
    }),
    db().routingPolicy.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, isDefault: true },
    }),
  ]);
  return (
    <section aria-labelledby="playground-title" className="space-y-6">
      <h1 id="playground-title" className="text-3xl font-bold">
        {t('title')}
      </h1>
      <p className="text-muted">{t('intro')}</p>
      <Playground
        targets={[
          ...policies.map((policy) => ({
            value: `policy:${policy.id}`,
            label: `${t('policy')}: ${policy.name}${policy.isDefault ? ` (${t('default')})` : ''}`,
          })),
          ...models.map((model) => ({
            value: `model:${model.id}`,
            label: `${model.provider.name} · ${model.displayName}`,
          })),
        ]}
      />
    </section>
  );
}
