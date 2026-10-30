import type { Metadata } from 'next';
import { LegalPage, legalMetadata } from '@/components/legal-page';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return legalMetadata('privacy', (await params).locale);
}

export default async function PrivacyPage({ params }: PageProps) {
  return <LegalPage page="privacy" locale={(await params).locale} />;
}
