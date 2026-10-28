'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FormMessage } from '@/components/forms';
import { manageSubscription, subscribe, type TopUpResult } from './actions';

/** Buttons that leave for Stripe's hosted checkout or customer portal. */
export function PlanButton({
  planId,
  planName,
  locale,
}: {
  planId: string;
  planName: string;
  locale: string;
}) {
  return (
    <GatewayButton
      label="subscribe"
      labelValues={{ plan: planName }}
      action={() => subscribe(planId, locale)}
    />
  );
}

export function ManageSubscriptionButton({ locale }: { locale: string }) {
  return <GatewayButton label="manage" action={() => manageSubscription(locale)} />;
}

function GatewayButton({
  label,
  labelValues,
  action,
}: {
  label: 'subscribe' | 'manage';
  labelValues?: Record<string, string>;
  action: () => Promise<TopUpResult>;
}) {
  const t = useTranslations('Billing');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      {error && <FormMessage tone="error">{t(`errors.${error}`)}</FormMessage>}
      <button
        type="button"
        className="btn btn-primary"
        disabled={pending}
        aria-busy={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          const result = await action();
          if (result.ok) {
            window.location.assign(result.url);
            return;
          }
          setPending(false);
          setError(result.error);
        }}
      >
        {pending ? t('redirecting') : t(label, labelValues)}
      </button>
    </div>
  );
}
