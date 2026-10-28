import { getServerEnv } from '@rentagent/core';
import { getSetting } from '@rentagent/db';
import { formatMoney } from '@rentagent/shared';
import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { billingOverview, getBillingConfig } from '@/lib/server/billing';
import { db } from '@/lib/server/runtime';
import { requirePermission } from '@/lib/server/session';
import { AdjustWalletForm, BillingSettingsForm, PayPalForm, StripeForm } from './billing-forms';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'AdminBilling' });
  return { title: t('title') };
}

export default async function AdminBillingPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission(locale, 'billing.manage', '/admin/billing');
  const t = await getTranslations('AdminBilling');
  const format = await getFormatter();
  const billing = await getBillingConfig();
  const { currency } = billing;
  const money = (minor: bigint) => formatMoney(minor, currency, locale);
  const [stripe, paypal] = await Promise.all([
    getSetting(db(), 'billing.stripe'),
    getSetting(db(), 'billing.paypal'),
  ]);
  const { revenue, refunds, charged, outstanding, payments } = await billingOverview();
  const users = await db().user.findMany({
    where: { id: { in: payments.flatMap((p) => (p.userId ? [p.userId] : [])) } },
    select: { id: true, email: true },
  });
  const emailOf = new Map(users.map((user) => [user.id, user.email]));
  const appUrl = getServerEnv().APP_URL.replace(/\/$/, '');

  return (
    <section aria-labelledby="billing-title" className="space-y-10">
      <div>
        <h1 id="billing-title" className="text-3xl font-bold">
          {t('title')}
        </h1>
        <p className="mt-2 text-muted">{t('intro', { currency })}</p>
      </div>

      <section aria-labelledby="billing-overview" className="space-y-3">
        <h2 id="billing-overview" className="text-xl font-bold">
          {t('overview')}
        </h2>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              ['revenue30', revenue],
              ['refunds30', refunds],
              ['charged30', charged],
              ['outstanding', outstanding],
            ] as const
          ).map(([key, value]) => (
            <div key={key} className="rounded-lg border border-border bg-surface p-4">
              <dt className="text-sm text-muted">{t(key)}</dt>
              <dd className="text-2xl font-bold" dir="ltr">
                {money(value)}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="billing-settings" className="space-y-4">
        <h2 id="billing-settings" className="text-xl font-bold">
          {t('settings')}
        </h2>
        <BillingSettingsForm values={billing.settings} currency={currency} />
      </section>

      <section
        aria-labelledby="billing-stripe"
        className="space-y-4 rounded-lg border border-border p-4"
      >
        <h2 id="billing-stripe" className="text-xl font-bold">
          Stripe
        </h2>
        <p className="text-sm text-muted">{t('stripeHint')}</p>
        <p className="text-sm">
          {t('webhookUrl')} <code dir="ltr">{`${appUrl}/api/webhooks/stripe`}</code>
        </p>
        <p className="text-sm">
          {t('stripeEvents')}{' '}
          <code dir="ltr">
            checkout.session.completed, checkout.session.async_payment_succeeded,
            checkout.session.async_payment_failed, checkout.session.expired, charge.refunded
          </code>
        </p>
        <StripeForm
          enabled={Boolean(stripe?.enabled)}
          hasSecret={Boolean(stripe?.secretKeyEncrypted)}
          hasWebhookSecret={Boolean(stripe?.webhookSecretEncrypted)}
          automaticTax={Boolean(stripe?.automaticTax)}
        />
      </section>

      <section
        aria-labelledby="billing-paypal"
        className="space-y-4 rounded-lg border border-border p-4"
      >
        <h2 id="billing-paypal" className="text-xl font-bold">
          PayPal
        </h2>
        <p className="text-sm text-muted">{t('paypalHint')}</p>
        <p className="text-sm">
          {t('webhookUrl')} <code dir="ltr">{`${appUrl}/api/webhooks/paypal`}</code>
        </p>
        <p className="text-sm">
          {t('paypalEvents')}{' '}
          <code dir="ltr">PAYMENT.CAPTURE.COMPLETED, PAYMENT.CAPTURE.REFUNDED</code>
        </p>
        <PayPalForm
          enabled={Boolean(paypal?.enabled)}
          mode={paypal?.mode ?? 'sandbox'}
          clientId={paypal?.clientId ?? ''}
          hasSecret={Boolean(paypal?.clientSecretEncrypted)}
          webhookId={paypal?.webhookId ?? ''}
        />
      </section>

      <section aria-labelledby="billing-adjust" className="space-y-4">
        <h2 id="billing-adjust" className="text-xl font-bold">
          {t('adjustTitle')}
        </h2>
        <p className="text-sm text-muted">{t('adjustHint')}</p>
        <AdjustWalletForm currency={currency} />
      </section>

      <section aria-labelledby="billing-payments">
        <h2 id="billing-payments" className="text-xl font-bold">
          {t('recentPayments')}
        </h2>
        {payments.length === 0 ? (
          <p className="mt-2">{t('noPayments')}</p>
        ) : (
          <div
            className="mt-3 overflow-x-auto rounded-lg border border-border"
            role="region"
            aria-labelledby="billing-payments"
            tabIndex={0}
          >
            <table className="w-full text-sm">
              <thead className="bg-surface">
                <tr>
                  <th scope="col" className="p-3 text-start">
                    {t('date')}
                  </th>
                  <th scope="col" className="p-3 text-start">
                    {t('user')}
                  </th>
                  <th scope="col" className="p-3 text-start">
                    {t('gateway')}
                  </th>
                  <th scope="col" className="p-3 text-start">
                    {t('status')}
                  </th>
                  <th scope="col" className="p-3 text-end">
                    {t('amount')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="p-3">
                      {format.dateTime(payment.createdAt, {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="p-3" dir="ltr">
                      {payment.userId ? (emailOf.get(payment.userId) ?? '—') : t('deletedUser')}
                    </td>
                    <td className="p-3">{payment.gateway === 'STRIPE' ? 'Stripe' : 'PayPal'}</td>
                    <td className="p-3">
                      {t(`payment_${payment.status}`)}
                      {payment.refundedMinor > 0n && (
                        <span className="block text-muted">
                          {t('refundedAmount', {
                            amount: formatMoney(payment.refundedMinor, payment.currency, locale),
                          })}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-end" dir="ltr">
                      {formatMoney(payment.amountMinor, payment.currency, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="text-sm text-muted">{t('legalNote')}</p>
    </section>
  );
}
