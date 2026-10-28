import { VENDOR_PUBLIC_KEYS } from '@rentagent/license';
import { getServerEnv } from '@rentagent/core';
import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { appHost, getLicenseSetting, getLicenseState } from '@/lib/server/license';
import { db } from '@/lib/server/runtime';
import { requirePermission } from '@/lib/server/session';
import { ActivateForm, LicenseActions } from './license-forms';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'AdminLicense' });
  return { title: t('title') };
}

export default async function LicensePage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission(locale, 'settings.manage', '/admin/license');
  const [t, format, state, setting, userCount] = await Promise.all([
    getTranslations('AdminLicense'),
    getFormatter(),
    getLicenseState(),
    getLicenseSetting(),
    db().user.count(),
  ]);
  const online = Boolean(getServerEnv().LICENSE_SERVER_URL);
  const license = state.license;
  const date = (iso: string | null) =>
    iso ? format.dateTime(new Date(iso), { dateStyle: 'medium', timeStyle: 'short' }) : t('never');
  const rows: [string, string][] = [
    [t('status'), t(`statuses.${state.status}`)],
    ...(license
      ? ([
          [t('licensee'), license.licensee],
          [t('tier'), t(`tiers.${license.tier}`)],
          [t('domains'), license.domains.join(', ')],
          [
            t('expires'),
            license.expiresAt
              ? format.dateTime(new Date(license.expiresAt), { dateStyle: 'long' })
              : t('noExpiry'),
          ],
          [
            t('users'),
            license.maxUsers === null
              ? t('usersUnlimited', { count: userCount })
              : t('usersOf', { count: userCount, max: license.maxUsers }),
          ],
          [t('whiteLabel'), state.features.includes('white_label') ? t('yes') : t('no')],
        ] as [string, string][])
      : []),
    [t('thisDomain'), appHost()],
    [
      t('source'),
      state.status === 'none' ? '—' : state.fromEnv ? t('sourceEnv') : t('sourceAdmin'),
    ],
    [
      t('onlineCheck'),
      online
        ? t('onlineCheckState', {
            success: date(setting.check.lastSuccessAt),
            attempt: date(setting.check.lastAttemptAt),
          })
        : t('onlineCheckOff'),
    ],
  ];
  return (
    <section aria-labelledby="license-title" className="max-w-3xl space-y-10">
      <div>
        <h1 id="license-title" className="text-3xl font-bold">
          {t('title')}
        </h1>
        <p className="mt-2 text-muted">{t('intro')}</p>
      </div>
      {VENDOR_PUBLIC_KEYS.length === 0 && (
        <p role="note" className="rounded-lg border border-border bg-warning-bg p-4">
          {t('noKeys')}
        </p>
      )}
      <section aria-labelledby="license-state-title" className="space-y-4">
        <h2 id="license-state-title" className="text-xl font-bold">
          {t('current')}
        </h2>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[12rem_1fr]">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="font-semibold">{label}</dt>
              <dd className="break-words" dir="auto">
                {value}
              </dd>
            </div>
          ))}
        </dl>
        {state.status !== 'valid' && state.status !== 'none' && (
          <p className="text-sm">{t(`help.${state.status}`)}</p>
        )}
        {state.graceDaysLeft !== null && (
          <p className="text-sm">{t('grace', { days: state.graceDaysLeft })}</p>
        )}
        {state.overUserLimit && <p className="text-sm">{t('overUsers')}</p>}
        {state.status !== 'none' && <LicenseActions online={online} removable={!state.fromEnv} />}
      </section>
      <section aria-labelledby="license-activate-title" className="space-y-4">
        <h2 id="license-activate-title" className="text-xl font-bold">
          {state.status === 'none' ? t('activateTitle') : t('replaceTitle')}
        </h2>
        <ActivateForm />
      </section>
      <p className="text-sm text-muted">{t('privacyNote')}</p>
    </section>
  );
}
