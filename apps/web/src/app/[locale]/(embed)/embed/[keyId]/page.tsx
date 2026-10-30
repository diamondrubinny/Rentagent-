import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ensureWidgetOrigins, loadWidgetKey } from '@/lib/server/widget';
import { WidgetApp } from './widget-app';

interface PageProps {
  params: Promise<{ locale: string; keyId: string }>;
}

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * The widget inside the customer's site (iframe). Framing is limited to the key's
 * allowed sites by the proxy (CSP frame-ancestors).
 */
export default async function EmbedPage({ params }: PageProps) {
  const { locale, keyId } = await params;
  setRequestLocale(locale);
  if (!/^[0-9a-f]{24}$/.test(keyId)) notFound();
  const loaded = await loadWidgetKey(keyId, locale);
  if (!loaded) notFound();
  const { agent, key } = loaded;
  await ensureWidgetOrigins(keyId, key.origins);
  return (
    <WidgetApp
      widgetKey={`ra_pk_${keyId}`}
      locale={locale}
      agent={{
        name: agent.name,
        description: agent.description,
        inputFields: agent.config.inputFields,
        followUps: agent.config.conversation.followUps,
      }}
    />
  );
}
