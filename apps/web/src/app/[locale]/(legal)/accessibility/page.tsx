import type { Metadata } from 'next';
import { LegalPage, legalMetadata } from '@/components/legal-page';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return legalMetadata('accessibility', (await params).locale);
}

export default async function AccessibilityPage({ params }: PageProps) {
  return <LegalPage page="accessibility" locale={(await params).locale} />;
}
