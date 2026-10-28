import { agentConfigSchema } from '@rentagent/shared';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { Link } from '@/i18n/navigation';
import { db } from '@/lib/server/runtime';
import { requirePermission } from '@/lib/server/session';
import { PreviewForm } from './preview-form';

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'AdminAgents.preview' });
  return { title: t('title') };
}

export default async function PreviewPage({ params }: PageProps) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requirePermission(locale, 'agents.manage', `/admin/agents/${id}/run`);
  if (!z.uuid().safeParse(id).success) notFound();
  const agent = await db().agent.findUnique({ where: { id } });
  if (!agent) notFound();
  const t = await getTranslations('AdminAgents.preview');
  const draft = agentConfigSchema.safeParse(agent.draft);
  const published = agent.publishedVersionId
    ? await db().agentVersion.findUnique({ where: { id: agent.publishedVersionId } })
    : null;
  const publishedConfig = published ? agentConfigSchema.parse(published.config) : null;

  return (
    <section aria-labelledby="preview-title" className="space-y-6">
      <p>
        <Link className="link" href={`/admin/agents/${id}`}>
          {t('back')}
        </Link>
      </p>
      <h1 id="preview-title" className="text-3xl font-bold">
        {t('title')}: <span dir="auto">{agent.name}</span>
      </h1>
      <p className="text-muted">{t('intro')}</p>
      {draft.success ? (
        <PreviewForm
          agentId={id}
          locale={locale}
          draftFields={draft.data.inputFields}
          publishedFields={publishedConfig?.inputFields ?? null}
          publishedVersion={published?.version ?? null}
        />
      ) : (
        <p className="font-semibold text-danger">{t('draftInvalid')}</p>
      )}
    </section>
  );
}
