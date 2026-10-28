'use client';

import {
  type AgentConfig,
  BUILTIN_TOOLS,
  INPUT_FIELD_TYPES,
  SIDE_EFFECT_BUILTINS,
} from '@rentagent/shared';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import { FormMessage, SubmitButton } from '@/components/forms';
import { useAction } from '@/components/use-action';
import { saveDraft } from '../actions';

interface ConfigFormProps {
  agentId: string;
  initial: AgentConfig;
  targets: { value: string; label: string }[];
  customTools: { id: string; label: string; sideEffect: boolean }[];
  locales: { code: string; name: string }[];
}

type Field = AgentConfig['inputFields'][number] & { optionsText: string };

const toEditable = (fields: AgentConfig['inputFields']): Field[] =>
  fields.map((field) => ({ ...field, optionsText: field.options.join(', ') }));

export function ConfigForm({ agentId, initial, targets, customTools, locales }: ConfigFormProps) {
  const t = useTranslations('AdminAgents.config');
  const tTools = useTranslations('AdminAgents.tools');
  const tErrors = useTranslations('AdminAgents.errors');
  const tValidation = useTranslations('Validation');
  const id = useId();
  const { pending, outcome, run, fieldErrors } = useAction();

  const [instructions, setInstructions] = useState(initial.instructions);
  const [target, setTarget] = useState(
    initial.target.type === 'default' ? 'default' : `${initial.target.type}:${initial.target.id}`,
  );
  const [tools, setTools] = useState<Record<string, 'never' | 'always' | null>>(() => {
    const map: Record<string, 'never' | 'always' | null> = {};
    for (const tool of initial.tools) map[tool.id] = tool.approval;
    return map;
  });
  const [fields, setFields] = useState<Field[]>(toEditable(initial.inputFields));
  const [languageMode, setLanguageMode] = useState(initial.language.mode);
  const [languageLocale, setLanguageLocale] = useState(
    initial.language.locale ?? locales[0]?.code ?? 'en',
  );
  const [limits, setLimits] = useState({
    maxSteps: String(initial.limits.maxSteps),
    maxOutputTokens: String(initial.limits.maxOutputTokens),
    maxCostUsd: initial.limits.maxCostUsd ?? '',
    timeoutSeconds: String(initial.limits.timeoutSeconds),
  });
  const [temperature, setTemperature] = useState(
    initial.temperature === null ? '' : String(initial.temperature),
  );
  const [domains, setDomains] = useState(initial.fetchAllowedDomains.join('\n'));
  const [outputFormat, setOutputFormat] = useState(initial.outputFormat);
  const [followUps, setFollowUps] = useState(initial.conversation.followUps);
  const [historyTurns, setHistoryTurns] = useState(String(initial.conversation.historyTurns));
  const [announcement, setAnnouncement] = useState('');

  const errorsFor = (prefix: string) =>
    Object.entries(fieldErrors)
      .filter(([path]) => path === prefix || path.startsWith(`${prefix}.`))
      .map(
        ([path, message]) =>
          `${path}: ${tValidation.has(message) ? tValidation(message) : message}`,
      );

  const updateField = (index: number, patch: Partial<Field>) =>
    setFields(fields.map((field, current) => (current === index ? { ...field, ...patch } : field)));
  const moveField = (index: number, delta: number) => {
    const next = [...fields];
    const [item] = next.splice(index, 1);
    if (!item) return;
    next.splice(index + delta, 0, item);
    setFields(next);
    setAnnouncement(
      t('fieldMoved', { label: item.label || item.key, position: index + delta + 1 }),
    );
  };

  function buildConfig() {
    const [targetType, targetId] = target.split(':');
    const number = (value: string) => (value.trim() === '' ? Number.NaN : Number(value));
    return {
      formatVersion: 1,
      instructions,
      target:
        targetType === 'default' || !targetId
          ? { type: 'default' }
          : { type: targetType, id: targetId },
      tools: Object.entries(tools)
        .filter(([, approval]) => approval !== null)
        .map(([toolId, approval]) => ({ id: toolId, approval })),
      inputFields: fields.map(({ optionsText, ...field }) => ({
        ...field,
        options:
          field.type === 'select'
            ? optionsText
                .split(',')
                .map((option) => option.trim())
                .filter(Boolean)
            : [],
      })),
      language:
        languageMode === 'fixed'
          ? { mode: languageMode, locale: languageLocale }
          : { mode: languageMode },
      limits: {
        maxSteps: number(limits.maxSteps),
        maxOutputTokens: number(limits.maxOutputTokens),
        maxCostUsd: limits.maxCostUsd.trim() === '' ? null : limits.maxCostUsd.trim(),
        timeoutSeconds: number(limits.timeoutSeconds),
      },
      fetchAllowedDomains: domains
        .split(/\s+/)
        .map((domain) => domain.trim())
        .filter(Boolean),
      outputFormat,
      temperature: temperature.trim() === '' ? null : number(temperature),
      conversation: { followUps, historyTurns: number(historyTurns) },
    };
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(() => saveDraft(agentId, buildConfig()));
  }

  const toolRow = (toolId: string, label: string, hint: string | null, sideEffect: boolean) => {
    const approval = tools[toolId] ?? null;
    return (
      <li
        key={toolId}
        className="flex flex-wrap items-center gap-3 rounded border border-border p-3"
      >
        <label className="flex grow items-center gap-3">
          <input
            type="checkbox"
            className="size-5"
            checked={approval !== null}
            onChange={(event) =>
              setTools({
                ...tools,
                [toolId]: event.target.checked ? (sideEffect ? 'always' : 'never') : null,
              })
            }
          />
          <span>
            <span className="block font-semibold">{label}</span>
            {hint && <span className="block text-sm text-muted">{hint}</span>}
          </span>
        </label>
        {approval !== null && (
          <label className="flex items-center gap-2 text-sm">
            <span>{t('approval')}</span>
            <select
              value={approval}
              onChange={(event) =>
                setTools({ ...tools, [toolId]: event.target.value as 'never' | 'always' })
              }
              className="field-input min-h-10 w-auto"
            >
              <option value="always">{t('approvalAlways')}</option>
              <option value="never">{t('approvalNever')}</option>
            </select>
          </label>
        )}
        {approval === 'never' && sideEffect && (
          <p className="w-full text-sm font-semibold text-danger">{t('approvalWarning')}</p>
        )}
      </li>
    );
  };

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-8" noValidate>
      {outcome?.ok && <FormMessage tone="success">{t('saved')}</FormMessage>}
      {outcome && !outcome.ok && (
        <FormMessage tone="error">
          <p>{tErrors(outcome.error)}</p>
          {Object.keys(fieldErrors).length > 0 && (
            <ul className="mt-2 list-disc ps-6 text-sm">
              {Object.entries(fieldErrors).map(([path, message]) => (
                <li key={path}>
                  <code dir="ltr">{path}</code>:{' '}
                  {tValidation.has(message) ? tValidation(message) : message}
                </li>
              ))}
            </ul>
          )}
        </FormMessage>
      )}

      <div>
        <label htmlFor={`${id}-instructions`} className="mb-1 block text-lg font-bold">
          {t('instructions')}
        </label>
        <p id={`${id}-instructions-hint`} className="mb-2 text-sm text-muted">
          {t('instructionsHint')}
        </p>
        <textarea
          id={`${id}-instructions`}
          rows={10}
          maxLength={20_000}
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          aria-describedby={`${id}-instructions-hint`}
          dir="auto"
          className="field-input py-2"
        />
      </div>

      <div>
        <label htmlFor={`${id}-target`} className="mb-1 block text-lg font-bold">
          {t('model')}
        </label>
        <select
          id={`${id}-target`}
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          className="field-input"
        >
          <option value="default">{t('defaultPolicy')}</option>
          {targets.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <fieldset>
        <legend className="mb-2 text-lg font-bold">{t('tools')}</legend>
        <ul className="space-y-2">
          {BUILTIN_TOOLS.map((tool) =>
            toolRow(
              tool,
              tTools(`${tool}.name`),
              tTools(`${tool}.hint`),
              SIDE_EFFECT_BUILTINS.includes(tool),
            ),
          )}
          {customTools.map((tool) => toolRow(tool.id, tool.label, null, tool.sideEffect))}
        </ul>
        {customTools.length === 0 && (
          <p className="mt-2 text-sm text-muted">{t('noCustomTools')}</p>
        )}
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-lg font-bold">{t('inputFields')}</legend>
        <p className="mb-3 text-sm text-muted">{t('inputFieldsHint')}</p>
        <p role="status" className="sr-only">
          {announcement}
        </p>
        <ol className="space-y-3">
          {fields.map((field, index) => (
            <li key={index} className="space-y-3 rounded-lg border border-border p-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block text-sm">
                  <span className="mb-1 block font-semibold">{t('fieldLabel')}</span>
                  <input
                    value={field.label}
                    onChange={(event) => updateField(index, { label: event.target.value })}
                    dir="auto"
                    className="field-input"
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-semibold">{t('fieldKey')}</span>
                  <input
                    value={field.key}
                    onChange={(event) => updateField(index, { key: event.target.value })}
                    dir="ltr"
                    className="field-input font-mono"
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-semibold">{t('fieldType')}</span>
                  <select
                    value={field.type}
                    onChange={(event) =>
                      updateField(index, { type: event.target.value as Field['type'] })
                    }
                    className="field-input"
                  >
                    {INPUT_FIELD_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {t(`type_${type}`)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {field.type === 'select' && (
                <label className="block text-sm">
                  <span className="mb-1 block font-semibold">{t('fieldOptions')}</span>
                  <input
                    value={field.optionsText}
                    onChange={(event) => updateField(index, { optionsText: event.target.value })}
                    dir="auto"
                    className="field-input"
                  />
                </label>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <label className="me-auto flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-5"
                    checked={field.required}
                    onChange={(event) => updateField(index, { required: event.target.checked })}
                  />
                  {t('fieldRequired')}
                </label>
                <button
                  type="button"
                  className="btn btn-secondary min-h-10"
                  disabled={index === 0}
                  onClick={() => moveField(index, -1)}
                  aria-label={t('moveUp', { label: field.label || field.key })}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn btn-secondary min-h-10"
                  disabled={index === fields.length - 1}
                  onClick={() => moveField(index, 1)}
                  aria-label={t('moveDown', { label: field.label || field.key })}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="btn btn-secondary min-h-10"
                  onClick={() => setFields(fields.filter((_, current) => current !== index))}
                  aria-label={t('removeField', { label: field.label || field.key })}
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ol>
        {fields.length < 20 && (
          <button
            type="button"
            className="btn btn-secondary mt-3"
            onClick={() =>
              setFields([
                ...fields,
                {
                  key: `field_${fields.length + 1}`,
                  label: '',
                  type: 'text',
                  required: false,
                  options: [],
                  optionsText: '',
                },
              ])
            }
          >
            {t('addField')}
          </button>
        )}
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-lg font-bold">{t('language')}</legend>
        <div className="space-y-2">
          {(['match_user', 'user_locale', 'fixed'] as const).map((mode) => (
            <label key={mode} className="flex items-center gap-3">
              <input
                type="radio"
                name={`${id}-language`}
                className="size-5"
                checked={languageMode === mode}
                onChange={() => setLanguageMode(mode)}
              />
              {t(`language_${mode}`)}
            </label>
          ))}
        </div>
        {languageMode === 'fixed' && (
          <label className="mt-3 block max-w-xs">
            <span className="mb-1 block text-sm font-semibold">{t('languageLocale')}</span>
            <select
              value={languageLocale}
              onChange={(event) => setLanguageLocale(event.target.value)}
              className="field-input"
            >
              {locales.map((locale) => (
                <option key={locale.code} value={locale.code} lang={locale.code}>
                  {locale.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-lg font-bold">{t('limits')}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {(['maxSteps', 'maxOutputTokens', 'maxCostUsd', 'timeoutSeconds'] as const).map((key) => (
            <label key={key} className="block">
              <span className="mb-1 block font-semibold">{t(`limit_${key}`)}</span>
              <span className="mb-1 block text-sm text-muted">{t(`limit_${key}_hint`)}</span>
              <input
                value={limits[key]}
                onChange={(event) => setLimits({ ...limits, [key]: event.target.value })}
                inputMode={key === 'maxCostUsd' ? 'decimal' : 'numeric'}
                dir="ltr"
                className="field-input"
                aria-invalid={errorsFor(`limits.${key}`).length > 0}
              />
            </label>
          ))}
          <label className="block">
            <span className="mb-1 block font-semibold">{t('temperature')}</span>
            <span className="mb-1 block text-sm text-muted">{t('temperatureHint')}</span>
            <input
              value={temperature}
              onChange={(event) => setTemperature(event.target.value)}
              inputMode="decimal"
              dir="ltr"
              className="field-input"
            />
          </label>
        </div>
      </fieldset>

      <div>
        <label htmlFor={`${id}-domains`} className="mb-1 block text-lg font-bold">
          {t('domains')}
        </label>
        <p id={`${id}-domains-hint`} className="mb-2 text-sm text-muted">
          {t('domainsHint')}
        </p>
        <textarea
          id={`${id}-domains`}
          rows={3}
          value={domains}
          onChange={(event) => setDomains(event.target.value)}
          aria-describedby={`${id}-domains-hint`}
          dir="ltr"
          className="field-input py-2 font-mono"
        />
      </div>

      <fieldset>
        <legend className="mb-2 text-lg font-bold">{t('outputFormat')}</legend>
        <div className="flex flex-wrap gap-6">
          {(['markdown', 'text'] as const).map((format) => (
            <label key={format} className="flex items-center gap-3">
              <input
                type="radio"
                name={`${id}-format`}
                className="size-5"
                checked={outputFormat === format}
                onChange={() => setOutputFormat(format)}
              />
              {t(`format_${format}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-2 text-lg font-bold">{t('conversation')}</legend>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 size-5"
            checked={followUps}
            onChange={(event) => setFollowUps(event.target.checked)}
          />
          <span>
            <span className="block font-semibold">{t('followUps')}</span>
            <span className="block text-sm text-muted">{t('followUpsHint')}</span>
          </span>
        </label>
        <label className="block max-w-xs">
          <span className="mb-1 block font-semibold">{t('historyTurns')}</span>
          <span className="mb-1 block text-sm text-muted">{t('historyTurnsHint')}</span>
          <input
            value={historyTurns}
            onChange={(event) => setHistoryTurns(event.target.value)}
            inputMode="numeric"
            dir="ltr"
            disabled={!followUps}
            className="field-input"
          />
        </label>
        {errorsFor('conversation').map((message) => (
          <p key={message} className="text-sm font-semibold text-danger">
            {message}
          </p>
        ))}
      </fieldset>

      <SubmitButton pending={pending} pendingLabel={t('saving')}>
        {t('save')}
      </SubmitButton>
    </form>
  );
}
