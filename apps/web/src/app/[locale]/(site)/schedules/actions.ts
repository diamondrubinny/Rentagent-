'use server';

import { enqueueSystemJob, getServerEnv, rateLimit } from '@rentagent/core';
import {
  applyPayload,
  checkCron,
  isValidTimeZone,
  MAX_SCHEDULES_PER_USER,
  normalizeSingleLine,
  runInputSchema,
} from '@rentagent/shared';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { audit } from '@/lib/server/audit';
import { runnableAgent } from '@/lib/server/catalog';
import { fieldErrorsOf, localeOf } from '@/lib/server/conversations';
import { db, redis } from '@/lib/server/runtime';
import { createTrigger, schedulesEnabled, triggerUrl } from '@/lib/server/schedules';
import { getCurrentUser } from '@/lib/server/session';

export type ScheduleResult =
  | { ok: true; trigger?: { url: string; secret: string } }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const forbidden = { ok: false, error: 'forbidden' } as const;
const notFound = { ok: false, error: 'notFound' } as const;
const refresh = () => revalidatePath('/[locale]/schedules', 'page');

async function scheduleUser() {
  const user = await getCurrentUser();
  if (!user || user.status !== 'ACTIVE' || !(await schedulesEnabled())) return null;
  return user;
}

const createSchema = z.object({
  name: z
    .string()
    .transform(normalizeSingleLine)
    .pipe(z.string().min(1, { error: 'required' }).max(80, { error: 'tooLong' })),
  agentId: z.uuid({ error: 'required' }),
  input: z.record(z.string(), z.string().max(20_000, { error: 'tooLong' })),
  cron: z.string().trim().max(100).nullable(),
  timeZone: z.string().refine(isValidTimeZone, { error: 'invalidTimeZone' }),
  locale: z.string().max(35),
  notifyEmail: z.boolean(),
  trigger: z.boolean(),
});

/** Creates a task; runs on its cron schedule, its trigger URL, or both. */
export async function createSchedule(input: z.input<typeof createSchema>): Promise<ScheduleResult> {
  const user = await scheduleUser();
  if (!user) return forbidden;
  const parsed = createSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: 'invalid', fieldErrors: fieldErrorsOf(parsed.error) };
  const data = parsed.data;
  if (!data.cron && !data.trigger)
    return { ok: false, error: 'invalid', fieldErrors: { cron: 'scheduleOrTrigger' } };
  const agent = await runnableAgent({ id: data.agentId }, localeOf(data.locale));
  if (!agent) return { ok: false, error: 'invalid', fieldErrors: { agentId: 'invalidOption' } };
  // Fields are checked as they will run (a trigger's payload fills {{payload}}).
  const fields = runInputSchema(agent.config.inputFields).safeParse(
    applyPayload(data.input, data.trigger ? 'payload' : ''),
  );
  if (!fields.success)
    return { ok: false, error: 'invalid', fieldErrors: fieldErrorsOf(fields.error) };
  let nextRunAt: Date | null = null;
  if (data.cron) {
    const check = checkCron(data.cron, data.timeZone);
    if (!check.ok) return { ok: false, error: 'invalid', fieldErrors: { cron: check.error } };
    nextRunAt = check.next[0]!;
  }
  if ((await db().schedule.count({ where: { userId: user.id } })) >= MAX_SCHEDULES_PER_USER)
    return { ok: false, error: 'tooMany' };
  const trigger = data.trigger ? createTrigger() : null;
  const schedule = await db().schedule.create({
    data: {
      userId: user.id,
      agentId: agent.id,
      name: data.name,
      input: data.input,
      locale: localeOf(data.locale),
      cron: data.cron || null,
      timeZone: data.timeZone,
      nextRunAt,
      notifyEmail: data.notifyEmail,
      triggerId: trigger?.triggerId ?? null,
      triggerSecretEncrypted: trigger?.encrypted ?? null,
    },
  });
  await audit('schedules.created', {
    actorId: user.id,
    target: `schedule:${schedule.id}`,
    meta: { cron: schedule.cron, trigger: Boolean(trigger) },
  });
  refresh();
  return {
    ok: true,
    ...(trigger ? { trigger: { url: triggerUrl(trigger.triggerId), secret: trigger.secret } } : {}),
  };
}

const uuid = z.uuid();

/** Pause or resume; resuming clears the failure count and plans the next run. */
export async function setScheduleEnabled(id: string, enabled: boolean): Promise<ScheduleResult> {
  const user = await scheduleUser();
  if (!user) return forbidden;
  if (!uuid.safeParse(id).success) return notFound;
  const schedule = await db().schedule.findFirst({ where: { id, userId: user.id } });
  if (!schedule) return notFound;
  const next = enabled && schedule.cron ? checkCron(schedule.cron, schedule.timeZone) : null;
  await db().schedule.update({
    where: { id },
    data: {
      enabled: enabled === true,
      ...(enabled ? { consecutiveFailures: 0, nextRunAt: next?.ok ? next.next[0] : null } : {}),
    },
  });
  await audit(enabled ? 'schedules.resumed' : 'schedules.paused', {
    actorId: user.id,
    target: `schedule:${id}`,
  });
  refresh();
  return { ok: true };
}

/** Starts the task now (counts toward the user's limits and credits like any run). */
export async function runScheduleNow(id: string): Promise<ScheduleResult> {
  const user = await scheduleUser();
  if (!user) return forbidden;
  if (!uuid.safeParse(id).success) return notFound;
  const schedule = await db().schedule.findFirst({
    where: { id, userId: user.id, enabled: true },
    select: { id: true },
  });
  if (!schedule) return notFound;
  const limit = await rateLimit(redis(), `schedule-now:${id}`, 5, 3600);
  if (!limit.allowed) return { ok: false, error: 'rateLimited' };
  await enqueueSystemJob(getServerEnv().REDIS_URL, {
    name: 'schedule-trigger',
    data: { scheduleId: id, payload: '' },
  });
  return { ok: true };
}

export async function deleteSchedule(id: string): Promise<ScheduleResult> {
  const user = await scheduleUser();
  if (!user) return forbidden;
  if (!uuid.safeParse(id).success) return notFound;
  // Its conversations stay in the chat history (the link to the task is cleared).
  const { count } = await db().schedule.deleteMany({ where: { id, userId: user.id } });
  if (!count) return notFound;
  await audit('schedules.deleted', { actorId: user.id, target: `schedule:${id}` });
  refresh();
  return { ok: true };
}
