import { flattenMessages, getTextDirection, isSupportedLocale } from '@rentagent/shared';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { builtinMessages, englishMessages } from '@/lib/server/locales';
import { db } from '@/lib/server/runtime';
import { requirePermission } from '@/lib/server/session';
import { TranslationProgress } from '../language-forms';
import { TranslationRow, type RowState } from './translation-row';

interface PageProps {
  params: Promise<{ locale: string; code: string }>;
  searchParams: Promise<{ ns?: string; filter?: string; q?: string; page?: string }>;
}

const PAGE_SIZE = 50;
const FILTERS = ['all', 'missing', 'auto'] as const;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'AdminLanguages' });
  return { title: t('editorTitle') };
}

export default async function TranslationEditorPage({ params, searchParams }: PageProps) {
  const { locale, code } = await params;
  setRequestLocale(locale);
  await requirePermission(locale, 'settings.manage', `/admin/languages/${code}`);
  if (!isSupportedLocale(code)) notFound();
  const target = await db().locale.findUnique({ where: { code } });
  if (!target) notFound();
  const query = await searchParams;
  const t = await getTranslations('AdminLanguages');

  const source = flattenMessages(await englishMessages());
  const builtin = code === 'en' ? source : flattenMessages((await builtinMessages(code)) ?? {});
  const stored = new Map(
    (await db().translation.findMany({ where: { locale: code } })).map((row) => [row.key, row]),
  );
  const namespaces = [...new Set(Object.keys(source).map((key) => key.split('.')[0]!))].sort();
  const namespace = namespaces.includes(query.ns ?? '') ? query.ns! : '';
  const filter = (FILTERS as readonly string[]).includes(query.filter ?? '')
    ? query.filter!
    : 'all';
  const search = (query.q ?? '').trim().toLowerCase().slice(0, 100);

  const all: RowState[] = Object.entries(source).map(([key, english]) => {
    const row = stored.get(key);
    return {
      key,
      source: english,
      value: row?.value ?? builtin[key] ?? '',
      state: row
        ? row.status === 'AUTO'
          ? 'auto'
          : 'reviewed'
        : key in builtin
          ? 'builtin'
          : 'missing',
    };
  });
  const filtered = all.filter(
    (row) =>
      (!namespace || row.key.startsWith(`${namespace}.`)) &&
      (filter === 'all' ||
        (filter === 'missing' ? row.state === 'missing' : row.state === 'auto')) &&
      (!search ||
        row.key.toLowerCase().includes(search) ||
        row.source.toLowerCase().includes(search) ||
        row.value.toLowerCase().includes(search)),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const missing = all.filter((row) => row.state === 'missing').length;
  const auto = all.filter((row) => row.state === 'auto').length;
  const href = (patch: Record<string, string>) => ({
    pathname: `/admin/languages/${code}`,
    query: { ns: namespace, filter, q: search, ...patch },
  });

  return (
    <section aria-labelledby="editor-title" className="space-y-6">
      <p>
        <Link className="link" href="/admin/languages">
          {t('back')}
        </Link>
      </p>
      <div>
        <h1 id="editor-title" className="text-3xl font-bold">
          {t('editorHeading')}:{' '}
          <span lang={code} dir={getTextDirection(code)}>
            {target.nativeName}
          </span>
        </h1>
        <p className="mt-2 text-muted">{t('summary', { total: all.length, missing, auto })}</p>
        {code !== 'en' && <TranslationProgress code={code} />}
      </div>

      <form
        method="get"
        className="flex flex-wrap items-end gap-3"
        role="search"
        aria-label={t('filterLabel')}
      >
        <div>
          <label htmlFor="editor-ns" className="mb-1 block font-semibold">
            {t('namespace')}
          </label>
          <select id="editor-ns" name="ns" defaultValue={namespace} className="field-input">
            <option value="">{t('allNamespaces')}</option>
            {namespaces.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="editor-filter" className="mb-1 block font-semibold">
            {t('show')}
          </label>
          <select id="editor-filter" name="filter" defaultValue={filter} className="field-input">
            <option value="all">{t('filter_all')}</option>
            <option value="missing">{t('filter_missing')}</option>
            <option value="auto">{t('filter_auto')}</option>
          </select>
        </div>
        <div className="min-w-48 flex-1">
          <label htmlFor="editor-q" className="mb-1 block font-semibold">
            {t('search')}
          </label>
          <input
            id="editor-q"
            name="q"
            type="search"
            defaultValue={search}
            dir="auto"
            className="field-input"
          />
        </div>
        <button type="submit" className="btn btn-secondary">
          {t('apply')}
        </button>
      </form>

      <p role="status">{t('showing', { count: filtered.length, page, pages })}</p>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-border p-6 text-center">{t('nothing')}</p>
      ) : (
        <ul className="space-y-4">
          {visible.map((row) => (
            <TranslationRow key={row.key} code={code} dir={getTextDirection(code)} row={row} />
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav aria-label={t('pagination')} className="flex flex-wrap gap-3">
          {page > 1 && (
            <Link className="link" href={href({ page: String(page - 1) })}>
              {t('previous')}
            </Link>
          )}
          {page < pages && (
            <Link className="link" href={href({ page: String(page + 1) })}>
              {t('next')}
            </Link>
          )}
        </nav>
      )}
    </section>
  );
}
