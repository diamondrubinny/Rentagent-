import { getLocale, getTranslations } from 'next-intl/server';
import { LanguageLinks } from '@/components/language-links';
import { ConsentManager } from '@/components/consent/consent-manager';
import { Link } from '@/i18n/navigation';
import { getBranding } from '@/lib/server/branding';
import { getEnabledLocales } from '@/lib/server/locales';

interface SiteFooterProps {
  siteName: string;
  optionalTrackersEnabled: boolean;
}

export async function SiteFooter({ siteName, optionalTrackersEnabled }: SiteFooterProps) {
  const t = await getTranslations('Footer');
  const hidePoweredBy = await getBranding()
    .then(({ branding }) => branding.hidePoweredBy)
    .catch(() => false);
  const currentLocale = await getLocale();
  const languages = (await getEnabledLocales()).map(({ code, nativeName, direction }) => ({
    code,
    name: nativeName,
    dir: direction,
  }));

  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 sm:grid-cols-2">
        <nav aria-label={t('legalNav')}>
          <ul className="space-y-2">
            <li>
              <Link className="link" href="/privacy">
                {t('privacy')}
              </Link>
            </li>
            <li>
              <Link className="link" href="/terms">
                {t('terms')}
              </Link>
            </li>
            <li>
              <Link className="link" href="/cookies">
                {t('cookies')}
              </Link>
            </li>
            <li>
              <Link className="link" href="/accessibility">
                {t('accessibility')}
              </Link>
            </li>
            <li>
              <ConsentManager optionalTrackersEnabled={optionalTrackersEnabled} />
            </li>
          </ul>
        </nav>
        <LanguageLinks label={t('languages')} languages={languages} currentLocale={currentLocale} />
      </div>
      <p className="pb-6 text-center text-sm text-muted">
        {t('rights', { year: new Date().getFullYear(), siteName })}
      </p>
      {!hidePoweredBy && <p className="pb-6 text-center text-xs text-muted">{t('poweredBy')}</p>}
    </footer>
  );
}
