'use client';

import { type AgentInputField, checkCron, presetCron } from '@rentagent/shared';
import { useFormatter, useTranslations } from 'next-intl';
import { type FormEvent, useMemo, useRef, useState, useTransition } from 'react';
import { FormMessage, SubmitButton, TextField } from '@/components/forms';
import { TaskFields } from '@/components/task-fields';
import { useRouter } from '@/i18n/navigation';
import {
  createSchedule,
  deleteSchedule,
  runScheduleNow,
  type ScheduleResult,
  setScheduleEnabled,
} from './actions';

type Mode = 'hourly' | 'daily' | 'weekdays' | 'weekly' | 'custom' | 'trigger';
const MODES: Mode[] = ['daily', 'weekdays', 'weekly', 'hourly', 'custom', 'trigger'];

export function CreateScheduleForm({
  agents,
  timeZones,
  defaultTimeZone,
  locale,
}: {
  agents: { id: string; name: string; inputFields: AgentInputField[] }[];
  timeZones: string[];
  defaultTimeZone: string;
  locale: string;
}) {
  const t = useTranslations('Schedules');
  const tValidation = useTranslations('Validation');
  const format = useFormatter();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ScheduleResult | null>(null);
  const [agentId, setAgentId] = useState(agents[0]?.id ?? '');
  const [mode, setMode] = useState<Mode>('daily');
  const [time, setTime] = useState('09:00');
  const [weekday, setWeekday] = useState(1);
  const [custom, setCustom] = useState('0 9 * * 1');
  const [timeZone, setTimeZone] = useState(defaultTimeZone);
  const formRef = useRef<HTMLFormElement>(null);
  const agent = agents.find((candidate) => candidate.id === agentId);

  const cron =
    mode === 'trigger' ? null : mode === 'custom' ? custom : presetCron(mode, time, weekday);
  // Live preview of the next runs (same check as the server).
  const preview = useMemo(() => (cron ? checkCron(cron, timeZone) : null), [cron, timeZone]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!agent) return;
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const next = await createSchedule({
        name: String(form.get('name') ?? ''),
        agentId,
        input: Object.fromEntries(
          agent.inputFields.map((field) => [field.key, String(form.get(field.key) ?? '')]),
        ),
        cron,
        timeZone,
        locale,
        notifyEmail: form.get('notifyEmail') === 'on',
        trigger: mode === 'trigger' || form.get('trigger') === 'on',
      });
      setResult(next);
      if (next.ok) {
        formRef.current?.reset();
        router.refresh();
      }
    });
  }

  const fieldErrors = result && !result.ok ? (result.fieldErrors ?? {}) : {};
  const error = (name: string) => (fieldErrors[name] ? tValidation(fieldErrors[name]) : undefined);
  const weekdayName = (day: number) =>
    format.dateTime(new Date(Date.UTC(2024, 0, 7 + day)), { weekday: 'long', timeZone: 'UTC' });

  return (
    <div className="space-y-6">
      {result?.ok && (
        <div role="status" className="space-y-2 rounded-lg border border-success bg-success-bg p-4">
          <p className="font-semibold">{t('created')}</p>
          {result.trigger && (
            <>
              <p>{t('triggerOnce')}</p>
              <label htmlFor="trigger-url" className="block text-sm font-semibold">
                {t('triggerUrl')}
              </label>
              <input
                id="trigger-url"
                readOnly
                value={result.trigger.url}
                dir="ltr"
                className="field-input font-mono text-sm"
              />
              <label htmlFor="trigger-secret" className="block text-sm font-semibold">
                {t('triggerSecret')}
              </label>
              <input
                id="trigger-secret"
                readOnly
                value={result.trigger.secret}
                dir="ltr"
                className="field-input font-mono text-sm"
              />
            </>
          )}
        </div>
      )}
      <form ref={formRef} onSubmit={onSubmit} className="space-y-5" noValidate>
        {result && !result.ok && (
          <FormMessage tone="error">{t(`errors.${result.error}`)}</FormMessage>
        )}
        <TextField name="name" label={t('name')} maxLength={80} error={error('name')} />
        <div>
          <label htmlFor="schedule-agent" className="mb-1 block font-semibold">
            {t('agent')}
          </label>
          <select
            id="schedule-agent"
            value={agentId}
            onChange={(event) => setAgentId(event.target.value)}
            className="field-input"
          >
            {agents.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
        </div>
        {agent && (
          <fieldset className="space-y-4">
            <legend className="font-semibold">{t('task')}</legend>
            <p className="text-sm text-muted">{t('payloadHint')}</p>
            <TaskFields key={agent.id} fields={agent.inputFields} errors={fieldErrors} />
          </fieldset>
        )}
        <fieldset className="space-y-3">
          <legend className="font-semibold">{t('when')}</legend>
          <div className="flex flex-wrap gap-3">
            {MODES.map((value) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="mode"
                  value={value}
                  checked={mode === value}
                  onChange={() => setMode(value)}
                  className="size-5"
                />
                {t(`mode_${value}`)}
              </label>
            ))}
          </div>
          {mode !== 'trigger' && mode !== 'custom' && (
            <div className="flex flex-wrap gap-4">
              {mode !== 'hourly' ? (
                <div>
                  <label htmlFor="schedule-time" className="mb-1 block text-sm font-semibold">
                    {t('time')}
                  </label>
                  <input
                    id="schedule-time"
                    type="time"
                    value={time}
                    onChange={(event) => setTime(event.target.value || '09:00')}
                    className="field-input"
                  />
                </div>
              ) : null}
              {mode === 'weekly' && (
                <div>
                  <label htmlFor="schedule-weekday" className="mb-1 block text-sm font-semibold">
                    {t('weekday')}
                  </label>
                  <select
                    id="schedule-weekday"
                    value={weekday}
                    onChange={(event) => setWeekday(Number(event.target.value))}
                    className="field-input"
                  >
                    {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                      <option key={day} value={day}>
                        {weekdayName(day)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
          {mode === 'custom' && (
            <TextField
              name="cron"
              label={t('cron')}
              hint={t('cronHint')}
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
              dir="ltr"
              className="field-input font-mono"
              error={error('cron')}
            />
          )}
          {mode !== 'trigger' && (
            <>
              <div>
                <label htmlFor="schedule-tz" className="mb-1 block text-sm font-semibold">
                  {t('timeZone')}
                </label>
                <select
                  id="schedule-tz"
                  value={timeZone}
                  onChange={(event) => setTimeZone(event.target.value)}
                  className="field-input"
                >
                  {timeZones.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </select>
              </div>
              <div aria-live="polite" className="text-sm">
                {preview?.ok ? (
                  <p>
                    {t('nextRuns')}{' '}
                    {preview.next
                      .slice(0, 3)
                      .map((date) =>
                        format.dateTime(date, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                          timeZone,
                        }),
                      )
                      .join(' · ')}
                  </p>
                ) : preview ? (
                  <p className="font-semibold text-danger">{tValidation(preview.error)}</p>
                ) : null}
              </div>
              <label className="flex items-start gap-3">
                <input type="checkbox" name="trigger" className="mt-1 size-5" />
                <span>
                  <span className="block font-semibold">{t('alsoTrigger')}</span>
                  <span className="block text-sm text-muted">{t('alsoTriggerHint')}</span>
                </span>
              </label>
            </>
          )}
          {fieldErrors.cron && mode !== 'custom' && (
            <p className="text-sm font-semibold text-danger">{tValidation(fieldErrors.cron)}</p>
          )}
        </fieldset>
        <label className="flex items-start gap-3">
          <input type="checkbox" name="notifyEmail" defaultChecked className="mt-1 size-5" />
          <span>
            <span className="block font-semibold">{t('notifyEmail')}</span>
            <span className="block text-sm text-muted">{t('notifyEmailHint')}</span>
          </span>
        </label>
        <SubmitButton pending={pending} pendingLabel={t('creating')}>
          {t('create')}
        </SubmitButton>
      </form>
    </div>
  );
}

/** Pause/resume, run now and delete (two-step) for one task. */
export function ScheduleActions({
  id,
  enabled,
  describedBy,
}: {
  id: string;
  enabled: boolean;
  describedBy: string;
}) {
  const t = useTranslations('Schedules');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const run = (action: () => Promise<ScheduleResult>, success?: string) =>
    startTransition(async () => {
      const result = await action();
      setMessage(
        result.ok
          ? success
            ? { tone: 'success', text: success }
            : null
          : { tone: 'error', text: t(`errors.${result.error}`) },
      );
      if (result.ok) router.refresh();
    });
  return (
    <div className="space-y-2">
      <div role="group" aria-describedby={describedBy} className="flex flex-wrap gap-2">
        {enabled && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={pending}
            onClick={() => run(() => runScheduleNow(id), t('started'))}
          >
            {t('runNow')}
          </button>
        )}
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pending}
          onClick={() => run(() => setScheduleEnabled(id, !enabled))}
        >
          {enabled ? t('pause') : t('resume')}
        </button>
        {confirming ? (
          <>
            <span className="self-center">{t('deleteConfirm')}</span>
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending}
              onClick={() => run(() => deleteSchedule(id))}
            >
              {t('deleteYes')}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setConfirming(false)}
            >
              {t('cancel')}
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-secondary" onClick={() => setConfirming(true)}>
            {t('delete')}
          </button>
        )}
      </div>
      {message && (
        <p
          role={message.tone === 'error' ? 'alert' : 'status'}
          className={message.tone === 'error' ? 'text-danger' : ''}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
