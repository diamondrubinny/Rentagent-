import { describe, expect, it } from 'vitest';
import { applyPayload, checkCron, nextCronRun, presetCron } from '../src/schedule';

const from = new Date('2026-10-30T00:00:00Z');

describe('checkCron', () => {
  it('accepts a schedule and returns the next runs in its time zone', () => {
    const result = checkCron('30 8 * * 1-5', 'Asia/Jerusalem', { from });
    expect(result.ok && result.next.map((date) => date.toISOString()).slice(0, 2)).toEqual([
      '2026-10-30T06:30:00.000Z',
      '2026-11-02T06:30:00.000Z',
    ]);
  });

  it('rejects malformed, seconds-based and too frequent schedules', () => {
    expect(checkCron('nope', 'UTC')).toEqual({ ok: false, error: 'invalidCron' });
    expect(checkCron('* * * * * *', 'UTC')).toEqual({ ok: false, error: 'invalidCron' });
    expect(checkCron('*/5 * * * *', 'UTC')).toEqual({ ok: false, error: 'tooFrequent' });
    expect(checkCron('0,30 9 * * *', 'UTC')).toEqual({ ok: false, error: 'tooFrequent' });
    expect(checkCron('0 9 * * *', 'Mars/Base')).toEqual({ ok: false, error: 'invalidTimeZone' });
    expect(checkCron('0 * * * *', 'UTC').ok).toBe(true);
  });

  it('builds presets and finds the next run', () => {
    expect(presetCron('daily', '07:15')).toBe('15 7 * * *');
    expect(presetCron('weekly', '18:00', 0)).toBe('0 18 * * 0');
    expect(nextCronRun('0 9 * * *', 'UTC', from)?.toISOString()).toBe('2026-10-30T09:00:00.000Z');
    expect(nextCronRun('bad', 'UTC', from)).toBeNull();
  });
});

describe('applyPayload', () => {
  it('replaces every placeholder and truncates the payload', () => {
    expect(
      applyPayload({ task: 'Summarize: {{payload}} / {{payload}}', other: 'x' }, 'hi'),
    ).toEqual({ task: 'Summarize: hi / hi', other: 'x' });
    expect(applyPayload({ task: '{{payload}}' }, 'a'.repeat(9000)).task).toHaveLength(8000);
  });
});
