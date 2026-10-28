import { PASSWORD_MIN_LENGTH, requiresTwoFactor } from '@rentagent/shared';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { FormMessageStatic } from '@/components/form-message-static';
import { requireUser } from '@/lib/server/session';
import { ChangePasswordForm } from './change-password-form';
import { SessionsList } from './sessions-list';
import { TwoFactorSettings } from './two-factor-settings';

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ mfa?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Account.security' });
  return { title: t('title') };
}

export default async function SecurityPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { mfa } = await searchParams;
  setRequestLocale(locale);
  const user = await requireUser(locale, '/account/security');
  const t = await getTranslations('Account.security');
  const mfaRequired = requiresTwoFactor(user.role) && !user.twoFactorEnabled;

  return (
    <div className="max-w-2xl space-y-12">
      <h1 className="text-3xl font-bold">{t('title')}</h1>
      {mfaRequired && (
        <FormMessageStatic tone={mfa ? 'error' : 'warning'}>{t('mfaRequired')}</FormMessageStatic>
      )}
      <section aria-labelledby="two-factor-title">
        <h2 id="two-factor-title" className="text-2xl font-bold">
          {t('twoFactor.title')}
        </h2>
        <TwoFactorSettings enabled={user.twoFactorEnabled} />
      </section>
      <section aria-labelledby="password-title">
        <h2 id="password-title" className="text-2xl font-bold">
          {t('password.title')}
        </h2>
        <ChangePasswordForm minLength={PASSWORD_MIN_LENGTH} />
      </section>
      <section aria-labelledby="sessions-title">
        <h2 id="sessions-title" className="text-2xl font-bold">
          {t('sessions.title')}
        </h2>
        <SessionsList />
      </section>
    </div>
  );
}
