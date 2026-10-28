import type { ReactNode } from 'react';

export function AuthCard({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby="auth-title" className="mx-auto w-full max-w-md">
      <h1 id="auth-title" className="text-3xl font-bold">
        {title}
      </h1>
      {intro && <p className="mt-2 text-muted">{intro}</p>}
      <div className="mt-8 rounded-lg border border-border bg-surface p-6">{children}</div>
    </section>
  );
}
