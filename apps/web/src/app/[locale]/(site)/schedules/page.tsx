import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { runnableAgents } from '@/lib/server/catalog';
import { db } from '@/lib/server/runtime';
import { schedulesEnabled } from '@/lib/server/schedules';
import { requireUser } from '@/lib/server/session';
import { getSetting } from '@rentagent/db';
import { CreateScheduleForm, ScheduleActions } from './schedule-forms';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Schedules' });
  return { title: t('title'), robots: { index: false } };
}

export default async function SchedulesPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, '/schedules');
  if (!(await schedulesEnabled())) notFound();
  const [t, format, schedules, agents, siteTimeZone] = await Promise.all([
    getTranslations('Schedules'),
    getFormatter(),
    db().schedule.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        agent: { select: { name: true } },
        conversations: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true } },
      },
    }),
    runnableAgents(locale),
    getSetting(db(), 'site.timeZone'),
  ]);
  const date = (value: Date | null, timeZone: string) =>
    value ? format.dateTime(value, { dateStyle: 'medium', timeStyle: 'short', timeZone }) : '—';

  return (
    <div className="max-w-3xl space-y-10">
      <div>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="mt-2">{t('intro')}</p>
      </div>

      <section aria-labelledby="schedules-list-title" className="space-y-4">
        <h2 id="schedules-list-title" className="text-xl font-bold">
          {t('yours')}
        </h2>
        {schedules.length === 0 ? (
          <p>{t('empty')}</p>
        ) : (
          <ul className="space-y-4">
            {schedules.map((schedule) => (
              <li key={schedule.id} className="space-y-3 rounded-lg border border-border p-4">
                <p id={`schedule-${schedule.id}`} className="font-semibold" dir="auto">
                  {schedule.name}
                </p>
                <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[10rem_1fr]">
                  <dt className="text-muted">{t('agent')}</dt>
                  <dd dir="auto">{schedule.agent.name}</dd>
                  <dt className="text-muted">{t('status')}</dt>
                  <dd>{schedule.enabled ? t('statusActive') : t('statusPaused')}</dd>
                  <dt className="text-muted">{t('when')}</dt>
                  <dd>
                    {schedule.cron ? (
                      <span dir="ltr" className="font-mono">
                        {schedule.cron}
                      </span>
                    ) : (
                      t('mode_trigger')
                    )}{' '}
                    {schedule.cron && `(${schedule.timeZone})`}
                    {schedule.triggerId && schedule.cron ? ` + ${t('mode_trigger')}` : ''}
                  </dd>
                  {schedule.enabled && schedule.nextRunAt && (
                    <>
                      <dt className="text-muted">{t('nextRun')}</dt>
                      <dd>{date(schedule.nextRunAt, schedule.timeZone)}</dd>
                    </>
                  )}
                  <dt className="text-muted">{t('lastRun')}</dt>
                  <dd>
                    {date(schedule.lastRunAt, schedule.timeZone)}
                    {schedule.lastStatus &&
                      ` — ${t.has(`last_${schedule.lastStatus}`) ? t(`last_${schedule.lastStatus}`) : schedule.lastStatus}`}
                    {schedule.conversations[0] && (
                      <>
                        {' '}
                        <Link className="link" href={`/chats/${schedule.conversations[0].id}`}>
                          {t('openLast')}
                        </Link>
                      </>
                    )}
                  </dd>
                  {schedule.triggerId && (
                    <>
                      <dt className="text-muted">{t('triggerUrl')}</dt>
                      <dd className="break-all font-mono" dir="ltr">
                        /api/hooks/schedules/{schedule.triggerId}
                      </dd>
                    </>
                  )}
                </dl>
                {!schedule.enabled && schedule.consecutiveFailures > 0 && (
                  <p className="text-sm">
                    {t('pausedAfterFailures', { count: schedule.consecutiveFailures })}
                  </p>
                )}
                <ScheduleActions
                  id={schedule.id}
                  enabled={schedule.enabled}
                  describedBy={`schedule-${schedule.id}`}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {agents.length > 0 && (
        <section aria-labelledby="schedule-create-title" className="space-y-4">
          <h2 id="schedule-create-title" className="text-xl font-bold">
            {t('createTitle')}
          </h2>
          <CreateScheduleForm
            agents={agents.map((agent) => ({
              id: agent.id,
              name: agent.name,
              inputFields: agent.config.inputFields,
            }))}
            timeZones={Intl.supportedValuesOf('timeZone')}
            defaultTimeZone={siteTimeZone ?? 'UTC'}
            locale={locale}
          />
        </section>
      )}
    </div>
  );
}
