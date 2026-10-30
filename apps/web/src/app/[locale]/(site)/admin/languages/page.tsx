import { flattenMessages, getLocaleNativeName, SUPPORTED_LOCALES } from '@rentagent/shared';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { builtinMessages, englishMessages } from '@/lib/server/locales';
import { db } from '@/lib/server/runtime';
import { requirePermission } from '@/lib/server/session';
import { AddLanguageForm, LanguageActions } from './language-forms';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'AdminLanguages' });
  return { title: t('title') };
}

export default async function LanguagesPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission(locale, 'settings.manage', '/admin/languages');
  const t = await getTranslations('AdminLanguages');

  const total = Object.keys(flattenMessages(await englishMessages())).length;
  const locales = await db().locale.findMany({ orderBy: [{ isDefault: 'desc' }, { code: 'asc' }] });
  const counts = await db().translation.groupBy({
    by: ['locale', 'status'],
    _count: { _all: true },
  });
  const count = (code: string, status: 'AUTO' | 'REVIEWED') =>
    counts.find((row) => row.locale === code && row.status === status)?._count._all ?? 0;

  const rows = await Promise.all(
    locales.map(async (row) => {
      const builtin = Object.keys(flattenMessages((await builtinMessages(row.code)) ?? {})).length;
      const translated =
        row.code === 'en'
          ? total
          : Math.min(
              total,
              Math.max(builtin, count(row.code, 'AUTO') + count(row.code, 'REVIEWED')),
            );
      return {
        row,
        percent: Math.floor((translated / total) * 100),
        pending: count(row.code, 'AUTO'),
      };
    }),
  );
  const enabledCodes = new Set(locales.filter((row) => row.enabled).map((row) => row.code));
  const available = SUPPORTED_LOCALES.filter((code) => !enabledCodes.has(code)).map((code) => ({
    code,
    name: getLocaleNativeName(code),
  }));

  return (
    <section aria-labelledby="languages-title" className="space-y-8">
      <div>
        <h1 id="languages-title" className="text-3xl font-bold">
          {t('title')}
        </h1>
        <p className="mt-2 text-muted">{t('intro')}</p>
      </div>

      <div
        className="overflow-x-auto rounded-lg border border-border"
        role="region"
        aria-label={t('title')}
        tabIndex={0}
      >
        <table className="w-full text-sm">
          <caption className="sr-only">{t('title')}</caption>
          <thead className="bg-surface">
            <tr>
              <th scope="col" className="p-3 text-start">
                {t('language')}
              </th>
              <th scope="col" className="p-3 text-start">
                {t('status')}
              </th>
              <th scope="col" className="p-3 text-start">
                {t('progress')}
              </th>
              <th scope="col" className="p-3 text-start">
                {t('actions')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map(({ row, percent, pending }) => (
              <tr key={row.code}>
                <th scope="row" className="p-3 text-start font-normal">
                  <span
                    lang={row.code}
                    dir={row.direction === 'RTL' ? 'rtl' : 'ltr'}
                    className="font-semibold"
                  >
                    {row.nativeName}
                  </span>{' '}
                  <code dir="ltr">{row.code}</code>
                  {row.direction === 'RTL' && <span className="ms-2 text-muted">{t('rtl')}</span>}
                </th>
                <td className="p-3">
                  {row.isDefault ? t('default') : row.enabled ? t('enabled') : t('disabled')}
                  {row.builtin && <span className="block text-muted">{t('builtin')}</span>}
                </td>
                <td className="p-3">
                  <span>{t('percent', { percent })}</span>
                  {pending > 0 && (
                    <span className="block font-semibold text-danger">
                      {t('pendingReview', { count: pending })}
                    </span>
                  )}
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link className="link" href={`/admin/languages/${row.code}`}>
                      {t('edit', { name: row.nativeName })}
                    </Link>
                    <LanguageActions
                      code={row.code}
                      name={row.nativeName}
                      enabled={row.enabled}
                      isDefault={row.isDefault}
                      canTranslate={row.code !== 'en' && percent < 100}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section
        aria-labelledby="add-language-title"
        className="space-y-3 rounded-lg border border-border bg-surface p-4"
      >
        <h2 id="add-language-title" className="text-xl font-bold">
          {t('addTitle')}
        </h2>
        <p className="text-sm text-muted">{t('addHint')}</p>
        <AddLanguageForm available={available} />
      </section>
    </section>
  );
}
