import type { ReactNode } from 'react';
import { redirect } from '@/i18n/navigation';
import { getSiteConfig } from '@/lib/server/site';

interface AuthLayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

/** Authentication pages only exist once the installation is configured. */
export default async function AuthLayout({ children, params }: AuthLayoutProps) {
  const { locale } = await params;
  if (!(await getSiteConfig()).setupComplete) redirect({ href: '/setup', locale });
  return children;
}
