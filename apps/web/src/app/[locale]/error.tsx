'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('Errors');
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section aria-labelledby="error-title" className="mx-auto max-w-xl text-center" role="alert">
      <h1 id="error-title" ref={headingRef} tabIndex={-1} className="text-3xl font-bold">
        {t('errorTitle')}
      </h1>
      <p className="mt-4 text-muted">{t('errorBody')}</p>
      {error.digest && (
        <p className="mt-2 text-sm text-muted">{t('reference', { digest: error.digest })}</p>
      )}
      <button type="button" onClick={reset} className="btn btn-primary mt-8">
        {t('retry')}
      </button>
    </section>
  );
}
