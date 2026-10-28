'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import { FormMessage, SubmitButton, TextField } from '@/components/forms';
import { useAction } from '@/components/use-action';
import { deletePolicy, savePolicy } from './actions';

interface ModelOption {
  id: string;
  label: string;
  available: boolean;
}

interface PolicyView {
  id: string;
  name: string;
  strategy: string;
  modelIds: string[];
  isDefault: boolean;
}

const STRATEGIES = ['FIXED', 'CHEAPEST', 'FASTEST'] as const;

export function PolicyEditor({
  policy,
  models,
}: {
  policy: PolicyView | null;
  models: ModelOption[];
}) {
  const t = useTranslations('AdminAi.routing');
  const tErrors = useTranslations('AdminAi.errors');
  const tValidation = useTranslations('Validation');
  const id = useId();
  const [chain, setChain] = useState<string[]>(policy?.modelIds ?? []);
  const [toAdd, setToAdd] = useState('');
  const [status, setStatus] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const { pending, outcome, run, fieldErrors } = useAction();
  const labelOf = (modelId: string) => models.find((model) => model.id === modelId);

  const move = (index: number, delta: number) => {
    const next = [...chain];
    const [item] = next.splice(index, 1);
    if (!item) return;
    next.splice(index + delta, 0, item);
    setChain(next);
    setStatus(t('moved', { model: labelOf(item)?.label ?? '', position: index + delta + 1 }));
  };

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(
      () =>
        savePolicy(policy?.id ?? null, {
          name: String(form.get('name') ?? ''),
          strategy: String(form.get('strategy') ?? 'FIXED'),
          modelIds: chain,
          isDefault: form.get('isDefault') === 'on',
        }),
      () => {
        if (!policy) {
          setChain([]);
          setFormKey((value) => value + 1);
        }
      },
    );
  }

  const available = models.filter((model) => !chain.includes(model.id));
  return (
    <form
      key={formKey}
      onSubmit={onSubmit}
      className="space-y-5 rounded-lg border border-border p-6"
      noValidate
      aria-labelledby={`${id}-title`}
    >
      <h2 id={`${id}-title`} className="text-xl font-bold">
        {policy ? (
          <>
            <span dir="auto">{policy.name}</span>{' '}
            {policy.isDefault && <span className="text-sm text-success">({t('default')})</span>}
          </>
        ) : (
          t('newTitle')
        )}
      </h2>
      {outcome?.ok && <FormMessage tone="success">{t('saved')}</FormMessage>}
      {outcome && !outcome.ok && <FormMessage tone="error">{tErrors(outcome.error)}</FormMessage>}
      <TextField
        name="name"
        label={t('name')}
        defaultValue={policy?.name ?? ''}
        dir="auto"
        required
        error={fieldErrors.name ? tValidation(fieldErrors.name) : undefined}
      />
      <fieldset>
        <legend className="mb-2 font-semibold">{t('strategy')}</legend>
        <div className="space-y-2">
          {STRATEGIES.map((strategy) => (
            <label key={strategy} className="flex items-start gap-3">
              <input
                type="radio"
                name="strategy"
                value={strategy}
                defaultChecked={(policy?.strategy ?? 'FIXED') === strategy}
                className="mt-1 size-5"
              />
              <span>
                <span className="block font-semibold">{t(`strategy_${strategy}`)}</span>
                <span className="block text-sm text-muted">{t(`strategy_${strategy}_hint`)}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 font-semibold">{t('chain')}</legend>
        <p className="mb-2 text-sm text-muted">{t('chainHint')}</p>
        {fieldErrors.modelIds && (
          <p className="mb-2 text-sm font-semibold text-danger">
            {tValidation(fieldErrors.modelIds)}
          </p>
        )}
        <ol className="space-y-2">
          {chain.map((modelId, index) => {
            const option = labelOf(modelId);
            return (
              <li
                key={modelId}
                className="flex flex-wrap items-center gap-2 rounded border border-border p-2"
              >
                <span className="grow">
                  {index + 1}. <span dir="auto">{option?.label ?? modelId}</span>
                  {option && !option.available && (
                    <span className="ms-2 text-sm text-danger">{t('unavailable')}</span>
                  )}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary min-h-10"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  aria-label={t('moveUp', { model: option?.label ?? '' })}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn btn-secondary min-h-10"
                  disabled={index === chain.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label={t('moveDown', { model: option?.label ?? '' })}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="btn btn-secondary min-h-10"
                  onClick={() => setChain(chain.filter((item) => item !== modelId))}
                  aria-label={t('remove', { model: option?.label ?? '' })}
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ol>
        <p role="status" className="sr-only">
          {status}
        </p>
        {available.length > 0 && (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="grow">
              <label htmlFor={`${id}-add`} className="mb-1 block text-sm font-semibold">
                {t('addModel')}
              </label>
              <select
                id={`${id}-add`}
                value={toAdd}
                onChange={(event) => setToAdd(event.target.value)}
                className="field-input"
              >
                <option value="">{t('choose')}</option>
                {available.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                    {model.available ? '' : ` (${t('unavailable')})`}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!toAdd}
              onClick={() => {
                setChain([...chain, toAdd]);
                setToAdd('');
              }}
            >
              {t('add')}
            </button>
          </div>
        )}
      </fieldset>
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          name="isDefault"
          defaultChecked={policy?.isDefault ?? false}
          className="size-5"
        />
        {t('isDefault')}
      </label>
      <div className="flex flex-wrap gap-2">
        <SubmitButton pending={pending} pendingLabel={t('saving')}>
          {t('save')}
        </SubmitButton>
        {policy &&
          (confirmDelete ? (
            <>
              <button
                type="button"
                className="btn bg-danger text-primary-fg"
                disabled={pending}
                onClick={() => run(() => deletePolicy(policy.id))}
              >
                {t('confirmDelete')}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setConfirmDelete(false)}
              >
                {t('cancel')}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setConfirmDelete(true)}
            >
              {t('delete')}
            </button>
          ))}
      </div>
    </form>
  );
}
