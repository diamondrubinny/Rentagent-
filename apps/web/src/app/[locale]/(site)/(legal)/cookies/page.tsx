import type { Metadata } from 'next';
import { LegalPage, legalMetadata } from '@/components/legal-page';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return legalMetadata('cookies', (await params).locale);
}

export default async function CookiesPage({ params }: PageProps) {
  return <LegalPage page="cookies" locale={(await params).locale} />;
}
