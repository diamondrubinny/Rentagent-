import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { Link } from '@/i18n/navigation';
import { db } from '@/lib/server/runtime';
import { requirePermission } from '@/lib/server/session';
import { RunView } from './run-view';

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'AdminAgents.run' });
  return { title: t('title') };
}

export default async function RunPage({ params }: PageProps) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const viewer = await requirePermission(locale, 'agents.manage', `/admin/runs/${id}`);
  if (!z.uuid().safeParse(id).success) notFound();
  const run = await db().run.findUnique({ where: { id }, select: { id: true, agentId: true } });
  if (!run) notFound();
  const t = await getTranslations('AdminAgents.run');
  return (
    <div className="space-y-6">
      <p className="flex flex-wrap gap-4">
        <Link className="link" href="/admin/runs">
          {t('allRuns')}
        </Link>
        <Link className="link" href={`/admin/agents/${run.agentId}`}>
          {t('agent')}
        </Link>
      </p>
      <RunView runId={run.id} viewerId={viewer.id} />
    </div>
  );
}
