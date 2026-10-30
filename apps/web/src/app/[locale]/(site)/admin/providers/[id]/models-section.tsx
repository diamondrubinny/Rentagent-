'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useMemo, useState } from 'react';
import { FormMessage, SubmitButton, TextField } from '@/components/forms';
import { useAction } from '@/components/use-action';
import { deleteModel, importModels, saveModel } from '../actions';

export interface ModelView {
  id: string;
  modelId: string;
  displayName: string;
  kind: string;
  tools: boolean;
  vision: boolean;
  json: boolean;
  reasoning: boolean;
  contextWindow: string;
  languages: string;
  costInPer1M: string;
  costOutPer1M: string;
  priceInPer1M: string;
  priceOutPer1M: string;
  visible: boolean;
  enabled: boolean;
}

const EMPTY: Omit<ModelView, 'id'> = {
  modelId: '',
  displayName: '',
  kind: 'CHAT',
  tools: false,
  vision: false,
  json: false,
  reasoning: false,
  contextWindow: '',
  languages: '',
  costInPer1M: '',
  costOutPer1M: '',
  priceInPer1M: '',
  priceOutPer1M: '',
  visible: false,
  enabled: true,
};

const CHECKBOXES = ['tools', 'vision', 'json', 'reasoning', 'visible', 'enabled'] as const;

function ModelForm({ providerId, model }: { providerId: string; model: ModelView | null }) {
  const t = useTranslations('AdminAi.models');
  const tErrors = useTranslations('AdminAi.errors');
  const tValidation = useTranslations('Validation');
  const { pending, outcome, run, fieldErrors } = useAction();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const values = model ?? { ...EMPTY, id: '' };
  const error = (name: string) => (fieldErrors[name] ? tValidation(fieldErrors[name]) : undefined);
  const idPrefix = useId();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input: Record<string, string | boolean> = {};
    for (const [key, value] of form.entries()) input[key] = String(value);
    for (const name of CHECKBOXES) input[name] = form.get(name) === 'on';
    run(
      () => saveModel(providerId, model?.id ?? null, input),
      () => {
        if (!model) setFormKey((value) => value + 1);
      },
    );
  }

  return (
    <form key={formKey} onSubmit={onSubmit} className="space-y-4 p-4" noValidate>
      {outcome?.ok && <FormMessage tone="success">{t('saved')}</FormMessage>}
      {outcome && !outcome.ok && <FormMessage tone="error">{tErrors(outcome.error)}</FormMessage>}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="modelId"
          label={t('modelId')}
          hint={t('modelIdHint')}
          defaultValue={values.modelId}
          dir="ltr"
          spellCheck={false}
          required
          error={error('modelId')}
        />
        <TextField
          name="displayName"
          label={t('displayName')}
          defaultValue={values.displayName}
          dir="auto"
          required
          error={error('displayName')}
        />
        <div>
          <label htmlFor={`${idPrefix}-kind`} className="mb-1 block font-semibold">
            {t('kind')}
          </label>
          <select
            id={`${idPrefix}-kind`}
            name="kind"
            defaultValue={values.kind}
            className="field-input"
          >
            <option value="CHAT">{t('kindChat')}</option>
            <option value="EMBEDDING">{t('kindEmbedding')}</option>
          </select>
        </div>
        <TextField
          name="contextWindow"
          label={t('contextWindow')}
          inputMode="numeric"
          defaultValue={values.contextWindow}
          dir="ltr"
          error={error('contextWindow')}
        />
      </div>
      <fieldset>
        <legend className="mb-2 font-semibold">{t('capabilities')}</legend>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {(['tools', 'vision', 'json', 'reasoning'] as const).map((name) => (
            <label key={name} className="flex items-center gap-2">
              <input type="checkbox" name={name} defaultChecked={values[name]} className="size-5" />
              {t(`cap_${name}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <TextField
        name="languages"
        label={t('languages')}
        hint={t('languagesHint')}
        defaultValue={values.languages}
        dir="ltr"
        error={error('languages')}
      />
      <fieldset>
        <legend className="mb-1 font-semibold">{t('pricing')}</legend>
        <p className="mb-3 text-sm text-muted">{t('pricingHint')}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="costInPer1M"
            label={t('costIn')}
            inputMode="decimal"
            defaultValue={values.costInPer1M}
            dir="ltr"
            error={error('costInPer1M')}
          />
          <TextField
            name="costOutPer1M"
            label={t('costOut')}
            inputMode="decimal"
            defaultValue={values.costOutPer1M}
            dir="ltr"
            error={error('costOutPer1M')}
          />
          <TextField
            name="priceInPer1M"
            label={t('priceIn')}
            inputMode="decimal"
            defaultValue={values.priceInPer1M}
            dir="ltr"
            error={error('priceInPer1M')}
          />
          <TextField
            name="priceOutPer1M"
            label={t('priceOut')}
            inputMode="decimal"
            defaultValue={values.priceOutPer1M}
            dir="ltr"
            error={error('priceOutPer1M')}
          />
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={values.enabled}
            className="size-5"
          />
          {t('enabled')}
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="visible"
            defaultChecked={values.visible}
            className="size-5"
          />
          {t('visible')}
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <SubmitButton pending={pending} pendingLabel={t('saving')}>
          {model ? t('save') : t('add')}
        </SubmitButton>
        {model &&
          (confirmDelete ? (
            <>
              <button
                type="button"
                className="btn bg-danger text-primary-fg"
                disabled={pending}
                onClick={() => run(() => deleteModel(model.id))}
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

export function ModelsSection({
  providerId,
  canDiscover,
  models,
}: {
  providerId: string;
  canDiscover: boolean;
  models: ModelView[];
}) {
  const t = useTranslations('AdminAi.models');
  const tErrors = useTranslations('AdminAi.errors');
  const importAction = useAction();
  const [query, setQuery] = useState('');
  const [onlyEnabled, setOnlyEnabled] = useState(false);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return models.filter(
      (model) =>
        (!onlyEnabled || model.enabled) &&
        (!needle ||
          model.modelId.toLowerCase().includes(needle) ||
          model.displayName.toLowerCase().includes(needle)),
    );
  }, [models, query, onlyEnabled]);

  return (
    <div className="mt-4 space-y-6">
      <p className="text-muted">{t('intro')}</p>
      {canDiscover ? (
        <div className="space-y-2">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={importAction.pending}
            onClick={() => importAction.run(() => importModels(providerId))}
          >
            {importAction.pending ? t('importing') : t('import')}
          </button>
          {importAction.outcome?.ok && (
            <FormMessage tone="success">
              {t('imported', importAction.outcome.values ?? {})}
            </FormMessage>
          )}
          {importAction.outcome && !importAction.outcome.ok && (
            <FormMessage tone="error">{tErrors(importAction.outcome.error)}</FormMessage>
          )}
        </div>
      ) : (
        <p className="text-sm">{t('noDiscovery')}</p>
      )}

      <details className="rounded-lg border border-border bg-surface">
        <summary className="cursor-pointer p-4 font-semibold">{t('addTitle')}</summary>
        <ModelForm providerId={providerId} model={null} />
      </details>

      {models.length > 0 && (
        <div className="flex flex-wrap items-end gap-4">
          <div className="grow">
            <TextField
              name="modelFilter"
              type="search"
              label={t('filter')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              dir="auto"
            />
          </div>
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              checked={onlyEnabled}
              onChange={(event) => setOnlyEnabled(event.target.checked)}
              className="size-5"
            />
            {t('onlyEnabled')}
          </label>
        </div>
      )}
      <p role="status" className="text-sm text-muted">
        {t('count', { shown: filtered.length, total: models.length })}
      </p>
      <ul className="space-y-2">
        {filtered.slice(0, 200).map((model) => (
          <li key={model.id}>
            <details className="rounded-lg border border-border">
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 p-3">
                <span className="font-semibold" dir="auto">
                  {model.displayName}
                </span>
                <code className="text-sm text-muted" dir="ltr">
                  {model.modelId}
                </code>
                <span className="text-sm">
                  {model.kind === 'EMBEDDING' ? t('kindEmbedding') : t('kindChat')}
                </span>
                <span
                  className={`text-sm font-semibold ${model.enabled ? 'text-success' : 'text-muted'}`}
                >
                  {model.enabled ? t('enabled') : t('disabledBadge')}
                </span>
                {model.visible && <span className="text-sm">{t('visibleBadge')}</span>}
              </summary>
              <ModelForm providerId={providerId} model={model} />
            </details>
          </li>
        ))}
      </ul>
      {filtered.length > 200 && <p className="text-sm text-muted">{t('refine')}</p>}
    </div>
  );
}
