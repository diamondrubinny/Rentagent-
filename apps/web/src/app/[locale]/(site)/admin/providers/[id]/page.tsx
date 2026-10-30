import {
  formatMicros,
  PROVIDERS,
  type ProviderTypeName,
  parseCapabilities,
} from '@rentagent/ai-gateway';
import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { Link } from '@/i18n/navigation';
import { toPlainNumber } from '@/lib/server/ai';
import { db } from '@/lib/server/runtime';
import { requirePermission } from '@/lib/server/session';
import { KeysSection } from './keys-section';
import { ModelsSection } from './models-section';
import { ProviderSettings } from './provider-settings';

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

async function loadProvider(id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  return db().provider.findUnique({
    where: { id },
    include: {
      keys: { orderBy: { createdAt: 'asc' } },
      models: { orderBy: [{ enabled: 'desc' }, { displayName: 'asc' }] },
    },
  });
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const provider = await loadProvider(id);
  return { title: provider?.name ?? 'AI' };
}

export default async function ProviderPage({ params }: PageProps) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requirePermission(locale, 'providers.manage', `/admin/providers/${id}`);
  const provider = await loadProvider(id);
  if (!provider) notFound();
  const t = await getTranslations('AdminAi.provider');
  const format = await getFormatter();
  const info = PROVIDERS[provider.type as ProviderTypeName];

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const spend = await db().usageRecord.groupBy({
    by: ['keyId'],
    where: { providerId: id, createdAt: { gte: monthStart } },
    _sum: { costMicros: true },
  });
  const spendByKey = new Map(spend.map((row) => [row.keyId, row._sum.costMicros ?? 0n]));
  const settings = (provider.settings ?? {}) as Record<string, string>;

  return (
    <div className="space-y-12">
      <div>
        <p>
          <Link className="link" href="/admin/providers">
            {t('back')}
          </Link>
        </p>
        <h1 className="mt-2 text-3xl font-bold" dir="auto">
          {provider.name}
        </h1>
        <p className="text-muted">
          {info.label} ·{' '}
          <a className="link" href={info.docsUrl} target="_blank" rel="noopener noreferrer">
            {t('docs')}
          </a>
        </p>
      </div>

      <section aria-labelledby="settings-title">
        <h2 id="settings-title" className="text-2xl font-bold">
          {t('settingsTitle')}
        </h2>
        <ProviderSettings
          providerId={provider.id}
          enabled={provider.enabled}
          option={{
            type: provider.type,
            label: info.label,
            defaultBaseUrl: info.defaultBaseUrl ?? '',
            baseUrlRequired: info.baseUrlRequired,
            settings: info.settings,
          }}
          values={{ name: provider.name, baseUrl: provider.baseUrl ?? '', ...settings }}
        />
      </section>

      <section aria-labelledby="keys-title">
        <h2 id="keys-title" className="text-2xl font-bold">
          {t('keysTitle')}
        </h2>
        <KeysSection
          providerId={provider.id}
          credential={info.credential}
          keys={provider.keys.map((key) => ({
            id: key.id,
            label: key.label,
            last4: key.last4,
            enabled: key.enabled,
            monthlyLimit:
              key.monthlyLimitMicros === null ? '' : formatMicros(key.monthlyLimitMicros, 2),
            spentThisMonth: formatMicros(spendByKey.get(key.id) ?? 0n, 4),
            lastUsed: key.lastUsedAt
              ? format.dateTime(key.lastUsedAt, { dateStyle: 'short', timeStyle: 'short' })
              : null,
            lastErrorKind: key.lastErrorKind,
          }))}
        />
      </section>

      <section aria-labelledby="models-title">
        <h2 id="models-title" className="text-2xl font-bold">
          {t('modelsTitle')}
        </h2>
        <ModelsSection
          providerId={provider.id}
          canDiscover={info.discovery !== 'none'}
          models={provider.models.map((model) => {
            const capabilities = parseCapabilities(model.capabilities);
            return {
              id: model.id,
              modelId: model.modelId,
              displayName: model.displayName,
              kind: model.kind,
              ...capabilities,
              contextWindow: model.contextWindow?.toString() ?? '',
              languages: model.languages.join(', '),
              costInPer1M: toPlainNumber(model.costInPer1M) ?? '',
              costOutPer1M: toPlainNumber(model.costOutPer1M) ?? '',
              priceInPer1M: toPlainNumber(model.priceInPer1M) ?? '',
              priceOutPer1M: toPlainNumber(model.priceOutPer1M) ?? '',
              visible: model.visible,
              enabled: model.enabled,
            };
          })}
        />
      </section>
    </div>
  );
}
