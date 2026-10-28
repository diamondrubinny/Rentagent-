import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactNode } from 'react';

/** Namespaces used by client components on every page (header, footer, consent, menus). */
const GLOBAL_NAMESPACES = ['Common', 'Consent', 'Footer', 'Header', 'A11y', 'Errors', 'Validation'];

/**
 * Sends only the translation namespaces that client components below need, instead
 * of every message on every page (~90 KB of HTML). Nested providers do not merge
 * with their parent, so the global namespaces are always included.
 */
export async function ClientMessages({
  namespaces = [],
  children,
}: {
  namespaces?: readonly string[];
  children: ReactNode;
}) {
  const all = await getMessages();
  const messages = Object.fromEntries(
    [...GLOBAL_NAMESPACES, ...namespaces]
      .filter((namespace) => namespace in all)
      .map((namespace) => [namespace, all[namespace]]),
  );
  return <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>;
}
