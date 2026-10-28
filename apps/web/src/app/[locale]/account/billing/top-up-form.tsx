'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FormMessage } from '@/components/forms';
import { startTopUp } from './actions';

export function TopUpForm({
  locale,
  packs,
  customRange,
  currency,
  gateways,
}: {
  locale: string;
  packs: { value: string; label: string }[];
  customRange: { min: string; max: string; label: string };
  currency: string;
  gateways: ('stripe' | 'paypal')[];
}) {
  const t = useTranslations('Billing');
  const [choice, setChoice] = useState(packs[0]?.value ?? 'custom');
  const [custom, setCustom] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pay(gateway: 'stripe' | 'paypal') {
    setError(null);
    setPending(gateway);
    const result = await startTopUp(gateway, choice === 'custom' ? custom.trim() : choice, locale);
    if (result.ok) {
      // Leave for the payment provider's own secure page.
      window.location.assign(result.url);
      return;
    }
    setPending(null);
    setError(result.error);
  }

  return (
    <form className="space-y-4" onSubmit={(event) => event.preventDefault()} noValidate>
      {error && <FormMessage tone="error">{t(`errors.${error}`)}</FormMessage>}
      <fieldset>
        <legend className="mb-2 font-semibold">{t('chooseAmount')}</legend>
        <div className="flex flex-wrap gap-4">
          {packs.map((pack) => (
            <label
              key={pack.value}
              className="flex items-center gap-2 rounded-lg border border-border px-4 py-2"
            >
              <input
                type="radio"
                name="amount"
                value={pack.value}
                className="size-5"
                checked={choice === pack.value}
                onChange={() => setChoice(pack.value)}
              />
              <span dir="ltr">{pack.label}</span>
            </label>
          ))}
          <label className="flex items-center gap-2 rounded-lg border border-border px-4 py-2">
            <input
              type="radio"
              name="amount"
              value="custom"
              className="size-5"
              checked={choice === 'custom'}
              onChange={() => setChoice('custom')}
            />
            {t('otherAmount')}
          </label>
        </div>
      </fieldset>
      {choice === 'custom' && (
        <div className="max-w-xs">
          <label htmlFor="custom-amount" className="mb-1 block font-semibold">
            {t('amountIn', { currency })}
          </label>
          <p id="custom-amount-hint" className="mb-1 text-sm text-muted">
            {customRange.label}
          </p>
          <input
            id="custom-amount"
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            inputMode="decimal"
            dir="ltr"
            aria-describedby="custom-amount-hint"
            className="field-input"
          />
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        {gateways.map((gateway) => (
          <button
            key={gateway}
            type="button"
            className="btn btn-primary"
            disabled={pending !== null}
            aria-busy={pending === gateway}
            onClick={() => void pay(gateway)}
          >
            {pending === gateway ? t('redirecting') : t(`pay_${gateway}`)}
          </button>
        ))}
      </div>
    </form>
  );
}
