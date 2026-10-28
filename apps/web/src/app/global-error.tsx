'use client';

import './globals.css';

// Last-resort boundary when the root layout itself fails; no i18n context is available here.
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" dir="ltr">
      <body className="grid min-h-screen place-items-center p-6">
        <main className="max-w-md text-center" role="alert">
          <h1 className="text-2xl font-bold">Something went wrong</h1>
          <p className="mt-2" lang="he" dir="rtl">
            משהו השתבש
          </p>
          <button type="button" className="btn btn-primary mt-6" onClick={reset}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
