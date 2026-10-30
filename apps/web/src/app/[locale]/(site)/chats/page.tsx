import { localizedAgent } from '@rentagent/shared';
import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { db } from '@/lib/server/runtime';
import { requireUser } from '@/lib/server/session';
import { DeleteConversationButton } from './delete-button';

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
}

const PAGE_SIZE = 100;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Chat' });
  return { title: t('listTitle'), robots: { index: false } };
}

export default async function ChatsPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, '/chats');
  const raw = (await searchParams).q;
  const query = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 200) ?? '';
  const t = await getTranslations('Chat');
  const format = await getFormatter();

  const conversations = await db().conversation.findMany({
    where: {
      userId: user.id,
      ...(query ? { title: { contains: query, mode: 'insensitive' as const } } : {}),
    },
    orderBy: { updatedAt: 'desc' },
    take: PAGE_SIZE,
    include: {
      agent: { select: { name: true, description: true, localizations: true } },
      runs: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">{t('listTitle')}</h1>
        <Link className="btn btn-primary" href="/agents">
          {t('newChat')}
        </Link>
      </div>

      <form
        method="get"
        role="search"
        aria-label={t('searchLabel')}
        className="flex flex-wrap items-end gap-3"
      >
        <div className="min-w-60 flex-1">
          <label htmlFor="chats-q" className="mb-1 block font-semibold">
            {t('searchLabel')}
          </label>
          <input
            id="chats-q"
            name="q"
            type="search"
            defaultValue={query}
            dir="auto"
            maxLength={200}
            className="field-input"
          />
        </div>
        <button type="submit" className="btn btn-secondary">
          {t('search')}
        </button>
      </form>

      {conversations.length === 0 ? (
        <p className="rounded-lg border border-border p-6 text-center">
          {query ? t('noResults') : t('empty')}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {conversations.map((conversation) => {
            const status = conversation.runs[0]?.status;
            return (
              <li key={conversation.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                <div className="min-w-0 flex-1">
                  <Link
                    className="link font-semibold"
                    href={`/chats/${conversation.id}`}
                    dir="auto"
                  >
                    {conversation.title}
                  </Link>
                  <p className="text-sm text-muted">
                    <span dir="auto">{localizedAgent(conversation.agent, locale).name}</span>
                    {' · '}
                    <time dateTime={conversation.updatedAt.toISOString()}>
                      {format.dateTime(conversation.updatedAt, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </time>
                    {status === 'WAITING_APPROVAL' && (
                      <strong className="ms-2 text-danger">{t('needsYourApproval')}</strong>
                    )}
                  </p>
                </div>
                <DeleteConversationButton
                  id={conversation.id}
                  title={conversation.title}
                  describedBy={`chat-title-${conversation.id}`}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
