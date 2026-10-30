import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getEnabledLocales } from '@/lib/server/locales';
import { requireUser } from '@/lib/server/session';
import { ProfileForm } from './profile-form';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Account.profile' });
  return { title: t('title') };
}

export default async function ProfilePage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, '/account');
  const t = await getTranslations('Account.profile');
  return (
    <section aria-labelledby="profile-title" className="max-w-xl">
      <h1 id="profile-title" className="text-3xl font-bold">
        {t('title')}
      </h1>
      <ProfileForm
        name={user.name}
        email={user.email}
        locale={user.locale ?? locale}
        locales={(await getEnabledLocales()).map(({ code, nativeName }) => ({
          code,
          name: nativeName,
        }))}
      />
    </section>
  );
}
