import { WEBHOOK_EVENTS } from '@rentagent/webhooks';
import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { db } from '@/lib/server/runtime';
import { requirePermission } from '@/lib/server/session';
import { CreateWebhookForm, DeliveryRow, WebhookActions } from './webhook-forms';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'AdminWebhooks' });
  return { title: t('title') };
}

export default async function WebhooksPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission(locale, 'settings.manage', '/admin/webhooks');
  const t = await getTranslations('AdminWebhooks');
  const format = await getFormatter();
  const hooks = await db().webhook.findMany({
    orderBy: { createdAt: 'asc' },
    include: { deliveries: { orderBy: { createdAt: 'desc' }, take: 10 } },
  });
  return (
    <section aria-labelledby="webhooks-title" className="space-y-10">
      <div>
        <h1 id="webhooks-title" className="text-3xl font-bold">
          {t('title')}
        </h1>
        <p className="mt-2 text-muted">{t('intro')}</p>
        <p className="mt-2 text-sm text-muted">{t('signatureHint')}</p>
      </div>

      <section
        aria-labelledby="new-webhook"
        className="space-y-4 rounded-lg border border-border bg-surface p-4"
      >
        <h2 id="new-webhook" className="text-xl font-bold">
          {t('addTitle')}
        </h2>
        <CreateWebhookForm events={[...WEBHOOK_EVENTS]} />
      </section>

      {hooks.length === 0 ? (
        <p>{t('empty')}</p>
      ) : (
        <ul className="space-y-6">
          {hooks.map((hook) => (
            <li key={hook.id} className="space-y-3 rounded-lg border border-border p-4">
              <h2 className="break-all text-lg font-bold" dir="ltr">
                <span id={`hook-${hook.id}`}>{hook.url}</span>
              </h2>
              {hook.description && <p dir="auto">{hook.description}</p>}
              <p className="text-sm">
                <strong>{hook.enabled ? t('enabled') : t('disabled')}</strong> · {t('events')}:{' '}
                <code dir="ltr">{hook.events.join(', ')}</code>
              </p>
              <WebhookActions id={hook.id} enabled={hook.enabled} />
              <details>
                <summary className="cursor-pointer font-semibold">
                  {t('deliveries', { count: hook.deliveries.length })}
                </summary>
                {hook.deliveries.length === 0 ? (
                  <p className="mt-2 text-muted">{t('noDeliveries')}</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {hook.deliveries.map((delivery) => (
                      <DeliveryRow
                        key={delivery.id}
                        id={delivery.id}
                        event={delivery.event}
                        status={delivery.status}
                        attempts={delivery.attempts}
                        responseStatus={delivery.responseStatus}
                        error={delivery.error}
                        when={format.dateTime(delivery.createdAt, {
                          dateStyle: 'short',
                          timeStyle: 'medium',
                        })}
                      />
                    ))}
                  </ul>
                )}
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
