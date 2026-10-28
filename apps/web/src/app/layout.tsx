import type { ReactNode } from 'react';

// The real document shell lives in app/[locale]/layout.tsx so that <html lang dir> follows the locale.
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
