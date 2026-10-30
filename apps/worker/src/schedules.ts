import { createFirstTurn, loadRunnableAgent, type RuntimeDeps } from '@rentagent/agent-runtime';
import { InsufficientCreditsError, loadBillingConfig } from '@rentagent/billing';
import { enqueueMail, enqueueRun, type MailTemplate, rateLimit } from '@rentagent/core';
import { getSetting, getSettings } from '@rentagent/db';
import { applyPayload, nextCronRun, runInputSchema } from '@rentagent/shared';

/** After this many failures in a row a task is paused and its owner told why. */
export const MAX_CONSECUTIVE_FAILURES = 3;
const BATCH = 20;
const DEFAULT_DAILY_LIMIT = 50;

export type ScheduleDeps = Pick<
  RuntimeDeps,
  'db' | 'log' | 'redis' | 'keyring' | 'redisUrl' | 'appUrl'
>;

type ScheduleRow = {
  id: string;
  userId: string;
  agentId: string;
  name: string;
  input: unknown;
  locale: string;
  notifyEmail: boolean;
};

async function schedulesEnabled(deps: ScheduleDeps): Promise<boolean> {
  return (await getSetting(deps.db, 'features'))?.schedules === true;
}

/** Emails the task owner (in their language), if they asked for emails. */
async function notify(
  deps: ScheduleDeps,
  scheduleId: string,
  template: MailTemplate,
  vars: Record<string, string>,
  path: string,
) {
  const schedule = await deps.db.schedule.findUnique({
    where: { id: scheduleId },
    select: {
      name: true,
      notifyEmail: true,
      user: { select: { email: true, name: true, locale: true } },
    },
  });
  if (!schedule?.notifyEmail && template !== 'scheduleStopped') return;
  if (!schedule) return;
  const settings = await getSettings(deps.db, [
    'site.name',
    'site.defaultLocale',
    'mail.smtp',
  ] as const);
  if (!settings['mail.smtp']?.enabled) return;
  const locale = schedule.user.locale ?? settings['site.defaultLocale'] ?? 'en';
  await enqueueMail(deps.redisUrl, {
    to: schedule.user.email,
    template,
    locale,
    vars: {
      name: schedule.user.name,
      siteName: settings['site.name'] ?? 'RentAgent',
      task: schedule.name,
      url: `${deps.appUrl.replace(/\/$/, '')}/${locale}${path}`,
      ...vars,
    },
  });
}

/** Records a failed start or run; pauses the task after too many failures in a row. */
export async function recordScheduleFailure(
  deps: ScheduleDeps,
  scheduleId: string,
  reason: string,
) {
  const updated = await deps.db.schedule.update({
    where: { id: scheduleId },
    data: { lastStatus: reason.slice(0, 20), consecutiveFailures: { increment: 1 } },
    select: { consecutiveFailures: true, enabled: true },
  });
  if (updated.enabled && updated.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    await deps.db.schedule.update({ where: { id: scheduleId }, data: { enabled: false } });
    await deps.db.auditLog.create({
      data: { action: 'schedules.paused', target: `schedule:${scheduleId}`, meta: { reason } },
    });
    await notify(
      deps,
      scheduleId,
      'scheduleStopped',
      { count: String(updated.consecutiveFailures), reason },
      '/schedules',
    );
  }
}

/**
 * Starts one run of a task (cron or trigger). Applies the same checks as the web app:
 * published agent, valid fields, the owner's daily limit and a credit hold.
 */
export async function startScheduledRun(
  deps: ScheduleDeps,
  schedule: ScheduleRow,
  payload?: string,
): Promise<{ ok: true; runId: string } | { ok: false; error: string }> {
  const owner = await deps.db.user.findUnique({
    where: { id: schedule.userId },
    select: { status: true },
  });
  if (owner?.status !== 'ACTIVE') return { ok: false, error: 'ownerInactive' };
  const agent = await loadRunnableAgent(deps.db, { id: schedule.agentId }, schedule.locale);
  if (!agent) return fail('agentUnavailable');
  const stored = (schedule.input ?? {}) as Record<string, string>;
  // Cron runs have no payload: the placeholder becomes empty text.
  const parsed = runInputSchema(agent.config.inputFields).safeParse(
    applyPayload(stored, payload ?? ''),
  );
  if (!parsed.success) return fail('invalidInput');
  const limit = (await getSetting(deps.db, 'agents.userDailyRunLimit')) ?? DEFAULT_DAILY_LIMIT;
  if (limit > 0) {
    const daily = await rateLimit(deps.redis, `user-run-day:${schedule.userId}`, limit, 86_400);
    if (!daily.allowed) return fail('dailyLimit');
  }
  try {
    const started = await createFirstTurn(deps.db, await loadBillingConfig(deps.db, deps.keyring), {
      userId: schedule.userId,
      agent,
      input: parsed.data,
      locale: schedule.locale,
      source: 'SCHEDULE',
      scheduleId: schedule.id,
    });
    await deps.db.schedule.update({
      where: { id: schedule.id },
      data: { lastRunAt: new Date(), lastStatus: 'QUEUED' },
    });
    await enqueueRun(deps.redisUrl, started.runId);
    return { ok: true, runId: started.runId };
  } catch (error) {
    if (error instanceof InsufficientCreditsError) return fail('insufficientCredits');
    throw error;
  }

  async function fail(reason: string) {
    await recordScheduleFailure(deps, schedule.id, reason);
    return { ok: false as const, error: reason };
  }
}

/**
 * Starts every due task. Each row is claimed (next run moved forward) in the same
 * transaction that locks it, so several workers never start the same run twice.
 */
export async function runDueSchedules(deps: ScheduleDeps, now = new Date()): Promise<number> {
  if (!(await schedulesEnabled(deps))) return 0;
  const claimed = await deps.db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      (ScheduleRow & { cron: string; timeZone: string })[]
    >`SELECT id, user_id AS "userId", agent_id AS "agentId", name, input, locale,
             notify_email AS "notifyEmail", cron, time_zone AS "timeZone"
        FROM schedules
       WHERE enabled AND cron IS NOT NULL AND next_run_at <= ${now}
       ORDER BY next_run_at
       LIMIT ${BATCH}
       FOR UPDATE SKIP LOCKED`;
    for (const row of rows)
      await tx.schedule.update({
        where: { id: row.id },
        data: { nextRunAt: nextCronRun(row.cron, row.timeZone, now) },
      });
    return rows;
  });
  for (const schedule of claimed) {
    try {
      await startScheduledRun(deps, schedule);
    } catch (error) {
      deps.log.error({ err: error, scheduleId: schedule.id }, 'scheduled run failed to start');
    }
  }
  return claimed.length;
}

/** Updates the task after one of its runs ended or waits for approval, and notifies the owner. */
export async function onScheduledRunUpdate(
  deps: ScheduleDeps,
  run: { id: string; status: string; errorKind: string | null; conversationId: string | null },
) {
  if (!run.conversationId) return;
  const conversation = await deps.db.conversation.findUnique({
    where: { id: run.conversationId },
    select: { scheduleId: true },
  });
  const scheduleId = conversation?.scheduleId;
  if (!scheduleId) return;
  const path = `/chats/${run.conversationId}`;
  if (run.status === 'WAITING_APPROVAL') {
    await deps.db.schedule.update({
      where: { id: scheduleId },
      data: { lastStatus: 'WAITING_APPROVAL' },
    });
    await notify(deps, scheduleId, 'scheduleApproval', {}, path);
  } else if (run.status === 'SUCCEEDED') {
    await deps.db.schedule.update({
      where: { id: scheduleId },
      data: { lastStatus: 'SUCCEEDED', consecutiveFailures: 0 },
    });
    await notify(deps, scheduleId, 'scheduleResult', {}, path);
  } else if (run.status === 'FAILED') {
    await recordScheduleFailure(deps, scheduleId, run.errorKind ?? 'failed');
  }
}
