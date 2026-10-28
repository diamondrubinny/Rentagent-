import Link from 'next/link';
import './globals.css';

// Rendered only for paths outside any locale (the proxy redirects almost everything to a locale).
export default function RootNotFound() {
  return (
    <html lang="en" dir="ltr">
      <body className="grid min-h-screen place-items-center p-6">
        <main className="max-w-md text-center">
          <h1 className="text-2xl font-bold">Page not found</h1>
          <p className="mt-2" lang="he" dir="rtl">
            הדף לא נמצא
          </p>
          <p className="mt-6">
            <Link className="link" href="/">
              Home
            </Link>
          </p>
        </main>
      </body>
    </html>
  );
}
