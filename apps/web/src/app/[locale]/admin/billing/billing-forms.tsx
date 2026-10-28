'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useState, useTransition } from 'react';
import { FormMessage, SubmitButton, TextField } from '@/components/forms';
import { useRouter } from '@/i18n/navigation';
import {
  adjustWallet,
  type BillingActionResult,
  saveBillingSettings,
  savePlan,
  savePayPalSettings,
  saveStripeSettings,
} from './actions';

/** Shared submit/feedback handling for the billing forms. */
function useBillingForm() {
  const t = useTranslations('AdminBilling');
  const tValidation = useTranslations('Validation');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<BillingActionResult | null>(null);
  const submit = (action: () => Promise<BillingActionResult>, after?: () => void) =>
    startTransition(async () => {
      const next = await action();
      setResult(next);
      if (next.ok) {
        after?.();
        router.refresh();
      }
    });
  const fieldErrors = result && !result.ok ? (result.fieldErrors ?? {}) : {};
  const error = (name: string) =>
    fieldErrors[name]
      ? tValidation.has(fieldErrors[name])
        ? tValidation(fieldErrors[name])
        : t(`errors.${fieldErrors[name]}`)
      : undefined;
  const message = result ? (
    result.ok ? (
      <FormMessage tone="success">{t('saved')}</FormMessage>
    ) : (
      <FormMessage tone="error">{t(`errors.${result.error}`)}</FormMessage>
    )
  ) : null;
  return { pending, submit, error, message, t };
}

export function BillingSettingsForm({
  values,
  currency,
}: {
  values: {
    enabled: boolean;
    packs: string[];
    customMin: string;
    customMax: string;
    signupCredit: string;
  };
  currency: string;
}) {
  const { pending, submit, error, message, t } = useBillingForm();
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const get = (name: string) => String(form.get(name) ?? '');
    submit(() =>
      saveBillingSettings({
        enabled: form.get('enabled') === 'on',
        packs: get('packs'),
        customMin: get('customMin'),
        customMax: get('customMax'),
        signupCredit: get('signupCredit'),
      }),
    );
  }
  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {message}
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={values.enabled}
          className="mt-1 size-5"
        />
        <span>
          <span className="block font-semibold">{t('enabled')}</span>
          <span className="block text-sm text-muted">{t('enabledHint')}</span>
        </span>
      </label>
      <TextField
        name="packs"
        label={t('packs', { currency })}
        hint={t('packsHint')}
        defaultValue={values.packs.join(', ')}
        dir="ltr"
        error={error('packs')}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          name="customMin"
          label={t('customMin', { currency })}
          defaultValue={values.customMin}
          inputMode="decimal"
          dir="ltr"
          error={error('customMin')}
        />
        <TextField
          name="customMax"
          label={t('customMax', { currency })}
          defaultValue={values.customMax}
          inputMode="decimal"
          dir="ltr"
          error={error('customMax')}
        />
        <TextField
          name="signupCredit"
          label={t('signupCredit', { currency })}
          hint={t('signupCreditHint')}
          defaultValue={values.signupCredit}
          inputMode="decimal"
          dir="ltr"
          error={error('signupCredit')}
        />
      </div>
      <SubmitButton pending={pending} pendingLabel={t('saving')}>
        {t('save')}
      </SubmitButton>
    </form>
  );
}

export function StripeForm({
  enabled,
  hasSecret,
  hasWebhookSecret,
  automaticTax,
}: {
  enabled: boolean;
  hasSecret: boolean;
  hasWebhookSecret: boolean;
  automaticTax: boolean;
}) {
  const { pending, submit, error, message, t } = useBillingForm();
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    submit(
      () =>
        saveStripeSettings({
          enabled: form.get('enabled') === 'on',
          secretKey: String(form.get('secretKey') ?? ''),
          webhookSecret: String(form.get('webhookSecret') ?? ''),
          automaticTax: form.get('automaticTax') === 'on',
        }),
      () => formElement.reset(),
    );
  }
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {message}
      <label className="flex items-center gap-3">
        <input type="checkbox" name="enabled" defaultChecked={enabled} className="size-5" />
        {t('gatewayEnabled', { gateway: 'Stripe' })}
      </label>
      <TextField
        name="secretKey"
        type="password"
        autoComplete="off"
        label={t('stripeSecret')}
        hint={hasSecret ? t('storedHint') : t('stripeSecretHint')}
        dir="ltr"
        error={error('secretKey')}
      />
      <TextField
        name="webhookSecret"
        type="password"
        autoComplete="off"
        label={t('stripeWebhookSecret')}
        hint={hasWebhookSecret ? t('storedHint') : undefined}
        dir="ltr"
        error={error('webhookSecret')}
      />
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="automaticTax"
          defaultChecked={automaticTax}
          className="mt-1 size-5"
        />
        <span>
          <span className="block font-semibold">{t('automaticTax')}</span>
          <span className="block text-sm text-muted">{t('automaticTaxHint')}</span>
        </span>
      </label>
      <SubmitButton pending={pending} pendingLabel={t('saving')}>
        {t('saveGateway', { gateway: 'Stripe' })}
      </SubmitButton>
    </form>
  );
}

export function PayPalForm({
  enabled,
  mode,
  clientId,
  hasSecret,
  webhookId,
}: {
  enabled: boolean;
  mode: string;
  clientId: string;
  hasSecret: boolean;
  webhookId: string;
}) {
  const { pending, submit, error, message, t } = useBillingForm();
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    submit(() =>
      savePayPalSettings({
        enabled: form.get('enabled') === 'on',
        mode: String(form.get('mode') ?? 'sandbox'),
        clientId: String(form.get('clientId') ?? ''),
        clientSecret: String(form.get('clientSecret') ?? ''),
        webhookId: String(form.get('webhookId') ?? ''),
      }),
    );
  }
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {message}
      <label className="flex items-center gap-3">
        <input type="checkbox" name="enabled" defaultChecked={enabled} className="size-5" />
        {t('gatewayEnabled', { gateway: 'PayPal' })}
      </label>
      <div>
        <label htmlFor="paypal-mode" className="mb-1 block font-semibold">
          {t('paypalMode')}
        </label>
        <select id="paypal-mode" name="mode" defaultValue={mode} className="field-input">
          <option value="sandbox">{t('sandbox')}</option>
          <option value="live">{t('live')}</option>
        </select>
      </div>
      <TextField
        name="clientId"
        label={t('paypalClientId')}
        defaultValue={clientId}
        autoComplete="off"
        dir="ltr"
        error={error('clientId')}
      />
      <TextField
        name="clientSecret"
        type="password"
        autoComplete="off"
        label={t('paypalSecret')}
        hint={hasSecret ? t('storedHint') : undefined}
        dir="ltr"
        error={error('clientSecret')}
      />
      <TextField
        name="webhookId"
        label={t('paypalWebhookId')}
        defaultValue={webhookId}
        autoComplete="off"
        dir="ltr"
        error={error('webhookId')}
      />
      <SubmitButton pending={pending} pendingLabel={t('saving')}>
        {t('saveGateway', { gateway: 'PayPal' })}
      </SubmitButton>
    </form>
  );
}

export function AdjustWalletForm({ currency }: { currency: string }) {
  const { pending, submit, error, message, t } = useBillingForm();
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    submit(
      () =>
        adjustWallet({
          email: String(form.get('email') ?? ''),
          amount: String(form.get('amount') ?? ''),
          reason: String(form.get('reason') ?? ''),
        }),
      () => formElement.reset(),
    );
  }
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {message}
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          name="email"
          type="email"
          label={t('userEmail')}
          autoComplete="off"
          dir="ltr"
          error={error('email')}
        />
        <TextField
          name="amount"
          label={t('adjustAmount', { currency })}
          hint={t('adjustAmountHint')}
          inputMode="decimal"
          dir="ltr"
          error={error('amount')}
        />
        <TextField
          name="reason"
          label={t('reason')}
          dir="auto"
          maxLength={200}
          error={error('reason')}
        />
      </div>
      <SubmitButton pending={pending} pendingLabel={t('saving')}>
        {t('adjust')}
      </SubmitButton>
    </form>
  );
}

export interface PlanFormValues {
  id: string | null;
  name: string;
  description: string;
  price: string;
  credits: string;
  interval: 'MONTH' | 'YEAR';
  active: boolean;
}

export function PlanForm({ values, currency }: { values: PlanFormValues; currency: string }) {
  const { pending, submit, error, message, t } = useBillingForm();
  const prefix = values.id ?? 'new';
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const get = (name: string) => String(form.get(name) ?? '');
    submit(
      () =>
        savePlan({
          id: values.id,
          name: get('name'),
          description: get('description'),
          price: get('price'),
          credits: get('credits'),
          interval: get('interval'),
          active: form.get('active') === 'on',
        }),
      () => {
        if (!values.id) formElement.reset();
      },
    );
  }
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {message}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={`${prefix}-name`}
          name="name"
          label={t('planName')}
          defaultValue={values.name}
          dir="auto"
          maxLength={80}
          error={error('name')}
        />
        <TextField
          id={`${prefix}-description`}
          name="description"
          label={t('planDescription')}
          defaultValue={values.description}
          dir="auto"
          maxLength={300}
          error={error('description')}
        />
        <TextField
          id={`${prefix}-price`}
          name="price"
          label={t('planPrice', { currency })}
          defaultValue={values.price}
          inputMode="decimal"
          dir="ltr"
          error={error('price')}
        />
        <TextField
          id={`${prefix}-credits`}
          name="credits"
          label={t('planCredits', { currency })}
          hint={t('planCreditsHint')}
          defaultValue={values.credits}
          inputMode="decimal"
          dir="ltr"
          error={error('credits')}
        />
      </div>
      <div className="flex flex-wrap items-end gap-6">
        <div>
          <label htmlFor={`${prefix}-interval`} className="mb-1 block font-semibold">
            {t('planInterval')}
          </label>
          <select
            id={`${prefix}-interval`}
            name="interval"
            defaultValue={values.interval}
            className="field-input"
          >
            <option value="MONTH">{t('interval_MONTH')}</option>
            <option value="YEAR">{t('interval_YEAR')}</option>
          </select>
        </div>
        <label className="flex items-center gap-3 pb-2">
          <input type="checkbox" name="active" defaultChecked={values.active} className="size-5" />
          {t('planActive')}
        </label>
      </div>
      <SubmitButton pending={pending} pendingLabel={t('saving')}>
        {values.id ? t('savePlan') : t('addPlan')}
      </SubmitButton>
    </form>
  );
}
