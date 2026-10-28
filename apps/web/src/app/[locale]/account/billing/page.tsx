import { decimalToMinor } from '@rentagent/billing';
import { formatMoney } from '@rentagent/shared';
import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { getBillingConfig } from '@/lib/server/billing';
import { db } from '@/lib/server/runtime';
import { requireUser } from '@/lib/server/session';
import { ManageSubscriptionButton, PlanButton } from './plan-actions';
import { TopUpForm } from './top-up-form';

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    paid?: string;
    canceled?: string;
    failed?: string;
    pending?: string;
    subscribed?: string;
  }>;
}

const HISTORY = 100;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Billing' });
  return { title: t('title') };
}

export default async function BillingPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, '/account/billing');
  const billing = await getBillingConfig();
  if (!billing.settings.enabled) notFound();
  const query = await searchParams;
  const t = await getTranslations('Billing');
  const format = await getFormatter();
  const { currency } = billing;
  const money = (minor: bigint) => formatMoney(minor, currency, locale);

  const [plans, subscription] = await Promise.all([
    db().plan.findMany({
      where: { active: true, stripePriceId: { not: null } },
      orderBy: [{ sortOrder: 'asc' }, { priceMinor: 'asc' }],
    }),
    db().subscription.findFirst({
      where: { userId: user.id, status: { not: 'CANCELED' } },
      orderBy: { createdAt: 'desc' },
      include: { plan: true },
    }),
  ]);
  const [wallet, entries, payments] = await Promise.all([
    db().wallet.findUnique({ where: { userId: user.id } }),
    db().ledgerEntry.findMany({
      where: { userId: user.id, type: { notIn: ['HOLD', 'RELEASE'] } },
      orderBy: { createdAt: 'desc' },
      take: HISTORY,
    }),
    db().payment.findMany({
      where: { userId: user.id, status: 'SUCCEEDED' },
      orderBy: { createdAt: 'desc' },
      take: HISTORY,
    }),
  ]);
  // Task charges show the agent that did the work.
  const runIds = entries.flatMap((entry) => (entry.runId ? [entry.runId] : []));
  const runs = await db().run.findMany({
    where: { id: { in: runIds } },
    select: { id: true, agent: { select: { name: true } } },
  });
  const agentOf = new Map(runs.map((run) => [run.id, run.agent.name]));
  const signupCredit = decimalToMinor(billing.settings.signupCredit || '0', currency);

  const notice = query.subscribed
    ? { tone: 'success', text: t('subscribedNotice') }
    : query.paid
      ? { tone: 'success', text: t('paid') }
      : query.pending
        ? { tone: 'success', text: t('pending') }
        : query.failed
          ? { tone: 'error', text: t('failed') }
          : query.canceled
            ? { tone: 'error', text: t('canceled') }
            : null;

  return (
    <div className="max-w-3xl space-y-10">
      <div>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        {notice && (
          <p
            role={notice.tone === 'error' ? 'alert' : 'status'}
            className={`mt-4 rounded-lg p-4 ${notice.tone === 'error' ? 'bg-danger-bg text-danger' : 'bg-success-bg text-success'}`}
          >
            {notice.text}
          </p>
        )}
      </div>

      <section
        aria-labelledby="balance-title"
        className="rounded-lg border border-border bg-surface p-6"
      >
        <h2 id="balance-title" className="text-xl font-bold">
          {t('balance')}
        </h2>
        <p className="mt-2 text-4xl font-bold" dir="ltr">
          {money(wallet?.balanceMinor ?? signupCredit)}
        </p>
        {wallet && wallet.heldMinor > 0n && (
          <p className="mt-1 text-sm text-muted">
            {t('held', { amount: money(wallet.heldMinor) })}
          </p>
        )}
        {!wallet && signupCredit > 0n && (
          <p className="mt-1 text-sm text-muted">{t('signupCredit')}</p>
        )}
        <p className="mt-3 text-sm text-muted">{t('howCharged')}</p>
      </section>

      {billing.stripe && (plans.length > 0 || subscription) && (
        <section aria-labelledby="plans-title" className="space-y-4">
          <h2 id="plans-title" className="text-xl font-bold">
            {t('plans')}
          </h2>
          {subscription ? (
            <div className="space-y-3 rounded-lg border border-border p-4">
              <p>
                {t('currentPlan', { plan: subscription.plan?.name ?? '—' })}{' '}
                <strong>{t(`subscription_${subscription.status}`)}</strong>
              </p>
              {subscription.currentPeriodEnd && (
                <p className="text-sm text-muted">
                  {t(subscription.cancelAtPeriodEnd ? 'endsOn' : 'renewsOn', {
                    date: format.dateTime(subscription.currentPeriodEnd, { dateStyle: 'long' }),
                  })}
                </p>
              )}
              <ManageSubscriptionButton locale={locale} />
            </div>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {plans.map((plan) => (
                <li key={plan.id} className="space-y-2 rounded-lg border border-border p-4">
                  <h3 className="text-lg font-bold" dir="auto">
                    {plan.name}
                  </h3>
                  {plan.description && <p dir="auto">{plan.description}</p>}
                  <p className="text-2xl font-bold" dir="ltr">
                    {formatMoney(plan.priceMinor, plan.currency, locale)}
                    <span className="text-base font-normal"> / {t(`per_${plan.interval}`)}</span>
                  </p>
                  <p className="text-sm text-muted">
                    {t('planCredits', {
                      amount: formatMoney(plan.creditsMinor, plan.currency, locale),
                    })}
                  </p>
                  <PlanButton planId={plan.id} planName={plan.name} locale={locale} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section aria-labelledby="topup-title" className="space-y-4">
        <h2 id="topup-title" className="text-xl font-bold">
          {t('topUp')}
        </h2>
        {!billing.stripe && !billing.paypal ? (
          <p>{t('noGateway')}</p>
        ) : (
          <TopUpForm
            locale={locale}
            packs={billing.settings.packs.map((pack) => ({
              value: pack,
              label: money(decimalToMinor(pack, currency)),
            }))}
            customRange={{
              min: billing.settings.customMin,
              max: billing.settings.customMax,
              label: t('customRange', {
                min: money(decimalToMinor(billing.settings.customMin, currency)),
                max: money(decimalToMinor(billing.settings.customMax, currency)),
              }),
            }}
            currency={currency}
            gateways={[
              ...(billing.stripe ? (['stripe'] as const) : []),
              ...(billing.paypal ? (['paypal'] as const) : []),
            ]}
          />
        )}
        <p className="text-sm text-muted">{t('secureNotice')}</p>
      </section>

      <section aria-labelledby="history-title">
        <h2 id="history-title" className="text-xl font-bold">
          {t('history')}
        </h2>
        {entries.length === 0 ? (
          <p className="mt-2">{t('noHistory')}</p>
        ) : (
          <div
            className="mt-3 overflow-x-auto rounded-lg border border-border"
            role="region"
            aria-labelledby="history-title"
            tabIndex={0}
          >
            <table className="w-full text-sm">
              <thead className="bg-surface">
                <tr>
                  <th scope="col" className="p-3 text-start">
                    {t('date')}
                  </th>
                  <th scope="col" className="p-3 text-start">
                    {t('description')}
                  </th>
                  <th scope="col" className="p-3 text-end">
                    {t('amount')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map((entry) => {
                  const amount = entry.type === 'CAPTURE' ? -entry.heldDelta : entry.availableDelta;
                  return (
                    <tr key={entry.id.toString()}>
                      <td className="p-3">
                        <time dateTime={entry.createdAt.toISOString()}>
                          {format.dateTime(entry.createdAt, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </time>
                      </td>
                      <td className="p-3" dir="auto">
                        {entry.type === 'CAPTURE'
                          ? t('entry_CAPTURE', {
                              agent: agentOf.get(entry.runId ?? '') ?? entry.note ?? '—',
                            })
                          : t(`entry_${entry.type}`)}
                      </td>
                      <td className="p-3 text-end" dir="ltr">
                        {amount > 0n ? '+' : amount < 0n ? '−' : ''}
                        {money(amount < 0n ? -amount : amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {payments.length > 0 && (
        <section aria-labelledby="payments-title">
          <h2 id="payments-title" className="text-xl font-bold">
            {t('payments')}
          </h2>
          <ul className="mt-3 space-y-2">
            {payments.map((payment) => (
              <li key={payment.id} className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <time dateTime={payment.createdAt.toISOString()}>
                  {format.dateTime(payment.createdAt, { dateStyle: 'medium' })}
                </time>
                <span dir="ltr">{formatMoney(payment.amountMinor, payment.currency, locale)}</span>
                <span>{payment.gateway === 'STRIPE' ? 'Stripe' : 'PayPal'}</span>
                {payment.refundedMinor > 0n && (
                  <span className="text-muted">
                    {t('refunded', {
                      amount: formatMoney(payment.refundedMinor, payment.currency, locale),
                    })}
                  </span>
                )}
                {payment.receiptUrl && (
                  <a
                    className="link"
                    href={payment.receiptUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t('receipt')}
                    <span className="sr-only"> {t('opensNewTab')}</span>
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
