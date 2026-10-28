import { can } from '@rentagent/shared';
import { getLocale, getTranslations } from 'next-intl/server';
import { SignOutButton } from '@/components/sign-out-button';
import { Link } from '@/i18n/navigation';
import { getCurrentUser } from '@/lib/server/session';
import { walletBalanceLabel } from '@/lib/server/billing';
import { getBranding, imageVersion } from '@/lib/server/branding';
import { getSiteConfig } from '@/lib/server/site';

export async function SiteHeader({ siteName }: { siteName: string }) {
  const t = await getTranslations('Header');
  const site = await getSiteConfig();
  const { branding } = site.setupComplete ? await getBranding() : { branding: null };
  const user = site.setupComplete ? await getCurrentUser() : null;
  const balance = user ? await walletBalanceLabel(user.id, await getLocale()) : null;
  return (
    <header className="border-b border-border bg-surface">
      <nav
        aria-label={t('mainNav')}
        className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3"
      >
        <Link href="/" className="me-auto flex items-center gap-2 text-lg font-bold no-underline">
          {branding?.logo && (
            // eslint-disable-next-line @next/next/no-img-element -- small operator logo, decorative next to the name
            <img
              src={`/api/branding/logo?v=${imageVersion(branding.logo)}`}
              alt=""
              className="h-8 w-auto"
            />
          )}
          {siteName}
        </Link>
        {site.setupComplete && (
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {(site.catalogPublic || user) && (
              <li>
                <Link className="link" href="/agents">
                  {t('agents')}
                </Link>
              </li>
            )}
            {user ? (
              <>
                <li>
                  <Link className="link" href="/chats">
                    {t('chats')}
                  </Link>
                </li>
                {balance !== null && (
                  <li>
                    <Link className="link" href="/account/billing">
                      {t('credits', { amount: balance })}
                    </Link>
                  </li>
                )}
                {can(user.role, 'admin.access') && (
                  <li>
                    <Link className="link" href="/admin">
                      {t('admin')}
                    </Link>
                  </li>
                )}
                <li>
                  <Link className="link" href="/account">
                    {t('account')}
                  </Link>
                </li>
                <li>
                  <SignOutButton />
                </li>
              </>
            ) : (
              <>
                <li>
                  <Link className="link" href="/sign-in">
                    {t('signIn')}
                  </Link>
                </li>
                {site.registrationOpen && (
                  <li>
                    <Link className="btn btn-primary" href="/sign-up">
                      {t('signUp')}
                    </Link>
                  </li>
                )}
              </>
            )}
          </ul>
        )}
      </nav>
    </header>
  );
}
