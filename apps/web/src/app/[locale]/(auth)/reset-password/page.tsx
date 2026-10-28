import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AuthCard } from '@/components/auth-card';
import { Link } from '@/i18n/navigation';
import { ResetPasswordForm } from './reset-password-form';

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string; error?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Auth.reset' });
  return { title: t('title'), robots: { index: false }, referrer: 'no-referrer' };
}

export default async function ResetPasswordPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { token, error } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('Auth.reset');
  const valid = Boolean(token) && !error && /^[\w-]{8,256}$/.test(token ?? '');
  return (
    <AuthCard title={t('title')} intro={valid ? t('intro') : undefined}>
      {valid ? (
        <ResetPasswordForm token={token!} />
      ) : (
        <div className="space-y-4">
          <p role="alert">{t('invalidLink')}</p>
          <Link className="link" href="/forgot-password">
            {t('requestNew')}
          </Link>
        </div>
      )}
    </AuthCard>
  );
}
