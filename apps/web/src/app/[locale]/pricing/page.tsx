import { decimalToMinor } from '@rentagent/billing';
import { formatMoney } from '@rentagent/shared';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { getBillingConfig } from '@/lib/server/billing';
import { db } from '@/lib/server/runtime';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Pricing' });
  return { title: t('title'), description: t('intro') };
}

/** Public overview of plans, credit packs and how tasks are charged. */
export default async function PricingPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const billing = await getBillingConfig();
  if (!billing.settings.enabled) notFound();
  const t = await getTranslations('Pricing');
  const tBilling = await getTranslations('Billing');
  const { currency } = billing;
  const plans = billing.stripe
    ? await db().plan.findMany({
        where: { active: true, stripePriceId: { not: null } },
        orderBy: [{ sortOrder: 'asc' }, { priceMinor: 'asc' }],
      })
    : [];
  const signup = decimalToMinor(billing.settings.signupCredit || '0', currency);
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="mt-2 text-lg text-muted">{t('intro')}</p>
        {signup > 0n && (
          <p className="mt-2">{t('welcome', { amount: formatMoney(signup, currency, locale) })}</p>
        )}
      </div>
      {plans.length > 0 && (
        <section aria-labelledby="pricing-plans">
          <h2 id="pricing-plans" className="text-2xl font-bold">
            {tBilling('plans')}
          </h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan) => (
              <li key={plan.id} className="rounded-lg border border-border bg-surface p-4">
                <h3 className="text-lg font-bold" dir="auto">
                  {plan.name}
                </h3>
                {plan.description && <p dir="auto">{plan.description}</p>}
                <p className="mt-2 text-2xl font-bold" dir="ltr">
                  {formatMoney(plan.priceMinor, plan.currency, locale)}
                  <span className="text-base font-normal">
                    {' '}
                    / {tBilling(`per_${plan.interval}`)}
                  </span>
                </p>
                <p className="text-sm text-muted">
                  {tBilling('planCredits', {
                    amount: formatMoney(plan.creditsMinor, plan.currency, locale),
                  })}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby="pricing-packs">
        <h2 id="pricing-packs" className="text-2xl font-bold">
          {t('packs')}
        </h2>
        <p className="mt-2">
          {billing.settings.packs
            .map((pack) => formatMoney(decimalToMinor(pack, currency), currency, locale))
            .join(' · ')}
        </p>
        <p className="mt-2 text-muted">{tBilling('howCharged')}</p>
      </section>
      <p>
        <Link className="btn btn-primary" href="/account/billing">
          {t('cta')}
        </Link>
      </p>
    </div>
  );
}
