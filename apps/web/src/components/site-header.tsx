import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

export async function SiteHeader({ siteName }: { siteName: string }) {
  const t = await getTranslations('Header');
  return (
    <header className="border-b border-border bg-surface">
      <nav
        aria-label={t('mainNav')}
        className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3"
      >
        <Link href="/" className="text-lg font-bold no-underline">
          {siteName}
        </Link>
      </nav>
    </header>
  );
}
