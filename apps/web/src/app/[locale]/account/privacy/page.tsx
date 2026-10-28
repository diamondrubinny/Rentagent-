import { can } from '@rentagent/shared';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireUser } from '@/lib/server/session';
import { getSiteConfig } from '@/lib/server/site';
import { DeleteAccountForm, DeleteHistoryButton } from './privacy-forms';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Privacy' });
  return { title: t('title') };
}

export default async function PrivacySettingsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, '/account/privacy');
  const site = await getSiteConfig();
  const t = await getTranslations('Privacy');

  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="mt-2">
          {site.runRetentionDays > 0
            ? t('retention', { days: site.runRetentionDays })
            : t('retentionKeep')}
        </p>
        <p className="mt-2">
          {t.rich('policyLinks', {
            privacy: (chunks) => (
              <Link className="link" href="/privacy">
                {chunks}
              </Link>
            ),
            cookies: (chunks) => (
              <Link className="link" href="/cookies">
                {chunks}
              </Link>
            ),
          })}
        </p>
      </div>

      <section aria-labelledby="export-title" className="space-y-3">
        <h2 id="export-title" className="text-xl font-bold">
          {t('exportTitle')}
        </h2>
        <p>{t('exportBody')}</p>
        <a className="btn btn-secondary" href="/api/account/export" download>
          {t('exportButton')}
        </a>
      </section>

      <section aria-labelledby="history-title" className="space-y-3">
        <h2 id="history-title" className="text-xl font-bold">
          {t('historyTitle')}
        </h2>
        <p>{t('historyBody')}</p>
        <DeleteHistoryButton />
      </section>

      <section
        aria-labelledby="delete-title"
        className="space-y-3 rounded-lg border-2 border-danger p-4"
      >
        <h2 id="delete-title" className="text-xl font-bold">
          {t('deleteTitle')}
        </h2>
        {can(user.role, 'admin.access') ? (
          <p>{t('deleteStaff')}</p>
        ) : (
          <>
            <p>{t('deleteBody')}</p>
            <DeleteAccountForm />
          </>
        )}
      </section>
    </div>
  );
}
