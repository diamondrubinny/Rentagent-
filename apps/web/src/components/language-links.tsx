'use client';

import { Link, usePathname } from '@/i18n/navigation';

interface LanguageLinksProps {
  label: string;
  currentLocale: string;
  languages: { code: string; name: string; dir: 'ltr' | 'rtl' }[];
}

/** Plain links (not an auto-submitting select) so keyboard and screen-reader users stay in control. */
export function LanguageLinks({ label, currentLocale, languages }: LanguageLinksProps) {
  const pathname = usePathname();
  return (
    <nav aria-label={label}>
      <h2 className="mb-2 font-semibold">{label}</h2>
      <ul className="flex flex-wrap gap-x-4 gap-y-2">
        {languages.map((language) => (
          <li key={language.code}>
            <Link
              href={pathname}
              locale={language.code}
              lang={language.code}
              dir={language.dir}
              hrefLang={language.code}
              aria-current={language.code === currentLocale ? 'true' : undefined}
              className={language.code === currentLocale ? 'font-bold' : 'link'}
            >
              {language.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
