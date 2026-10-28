import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

export default async function NotFound() {
  const t = await getTranslations('Errors');
  return (
    <section aria-labelledby="not-found" className="mx-auto max-w-xl text-center">
      <h1 id="not-found" className="text-3xl font-bold">
        {t('notFoundTitle')}
      </h1>
      <p className="mt-4 text-muted">{t('notFoundBody')}</p>
      <Link href="/" className="btn btn-primary mt-8">
        {t('backHome')}
      </Link>
    </section>
  );
}
