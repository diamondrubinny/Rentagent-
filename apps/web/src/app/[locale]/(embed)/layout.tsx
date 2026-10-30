import type { ReactNode } from 'react';
import { ClientMessages } from '@/components/client-messages';

/** The embeddable widget: no site header or footer, only the conversation. */
export default function EmbedLayout({ children }: { children: ReactNode }) {
  return (
    <ClientMessages namespaces={['Chat', 'Widget']}>
      <main id="main" className="flex min-h-screen flex-col">
        {children}
      </main>
    </ClientMessages>
  );
}
