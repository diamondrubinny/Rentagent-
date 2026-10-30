import { Cron } from 'croner';
import { isValidTimeZone } from './i18n';

/** Scheduled tasks never run more often than this (protects credits and providers). */
export const SCHEDULE_MIN_INTERVAL_MINUTES = 60;
export const MAX_SCHEDULES_PER_USER = 10;
/** Placeholder in task fields replaced by the trigger request body. */
export const PAYLOAD_PLACEHOLDER = '{{payload}}';
export const PAYLOAD_MAX_CHARS = 8000;

export type CronCheck =
  | { ok: true; next: Date[] }
  | { ok: false; error: 'invalidCron' | 'invalidTimeZone' | 'tooFrequent' };

/**
 * Validates a 5-field cron expression (minute hour day month weekday) in a time
 * zone and returns the next runs. Rejects schedules more frequent than the minimum.
 */
export function checkCron(
  expression: string,
  timeZone: string,
  { from = new Date(), minIntervalMinutes = SCHEDULE_MIN_INTERVAL_MINUTES } = {},
): CronCheck {
  if (!isValidTimeZone(timeZone)) return { ok: false, error: 'invalidTimeZone' };
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5 || expression.length > 100) return { ok: false, error: 'invalidCron' };
  let next: Date[];
  try {
    next = new Cron(fields.join(' '), { timezone: timeZone, paused: true }).nextRuns(24, from);
  } catch {
    return { ok: false, error: 'invalidCron' };
  }
  if (next.length === 0) return { ok: false, error: 'invalidCron' };
  for (let i = 1; i < next.length; i++)
    if (next[i]!.getTime() - next[i - 1]!.getTime() < minIntervalMinutes * 60_000)
      return { ok: false, error: 'tooFrequent' };
  return { ok: true, next: next.slice(0, 5) };
}

/** The first run strictly after `from`, or null (e.g. an expression that never matches). */
export function nextCronRun(expression: string, timeZone: string, from = new Date()): Date | null {
  try {
    return new Cron(expression, { timezone: timeZone, paused: true }).nextRun(from);
  } catch {
    return null;
  }
}

/** Builds a cron expression from the simple form (hourly, daily, weekdays, weekly). */
export function presetCron(
  preset: 'hourly' | 'daily' | 'weekdays' | 'weekly',
  time = '09:00',
  weekday = 1,
): string {
  const [hour, minute] = time.split(':').map(Number) as [number, number];
  if (preset === 'hourly') return `${minute} * * * *`;
  if (preset === 'daily') return `${minute} ${hour} * * *`;
  if (preset === 'weekdays') return `${minute} ${hour} * * 1-5`;
  return `${minute} ${hour} * * ${weekday}`;
}

/** Replaces the payload placeholder in task fields with the (truncated) trigger body. */
export function applyPayload(
  input: Record<string, string>,
  payload: string,
): Record<string, string> {
  const text = payload.slice(0, PAYLOAD_MAX_CHARS);
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, value.split(PAYLOAD_PLACEHOLDER).join(text)]),
  );
}
