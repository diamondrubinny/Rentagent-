import type { Metadata } from 'next';
import { LegalPage, legalMetadata } from '@/components/legal-page';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return legalMetadata('terms', (await params).locale);
}

export default async function TermsPage({ params }: PageProps) {
  return <LegalPage page="terms" locale={(await params).locale} />;
}
