import type { RuntimeDeps } from '@rentagent/agent-runtime';
import { generate } from '@rentagent/ai-gateway';
import { I18N_KEYS, type TranslationJobProgress } from '@rentagent/core';
import { agentSearchText, getLocaleNativeName, isCompatibleTranslation } from '@rentagent/shared';

const BATCH = 40;

const RULES = [
  'Rules:',
  '- Keep ICU MessageFormat syntax exactly: never translate or rename variable names inside {curly braces}; translate only the human-readable text inside plural/select branches, and keep "#".',
  '- Keep <tag>...</tag> markup with the same tag names; translate only the text between the tags.',
  '- Keep product names, URLs, e-mail addresses, file extensions, code and keyboard shortcuts unchanged.',
  '- Use a concise, neutral and polite user-interface style; use gender-neutral wording where the language allows it.',
  '- Answer with one JSON object only (no Markdown), with exactly the same keys as the input.',
].join('\n');

/** Extracts the first JSON object from a model answer (tolerates code fences). */
export function parseJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const value = JSON.parse(text.slice(start, end + 1)) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function translateBatch(
  deps: RuntimeDeps,
  locale: string,
  batch: Record<string, string>,
  from = 'English',
): Promise<Record<string, unknown> | null> {
  const language = `${getLocaleNativeName(locale)} (${locale})`;
  const result = await generate(
    deps,
    { defaultPolicy: true },
    {
      system: `You translate user-interface text of a web application from ${from} into ${language}.\n${RULES}`,
      prompt: JSON.stringify(batch),
      maxOutputTokens: 8000,
      temperature: 0,
    },
    { purpose: 'translation' },
  );
  return parseJsonObject(result.text);
}

/**
 * Machine-translates UI strings into a locale. Every result must keep the
 * source's ICU variables and tags; rejected strings stay in English. Strings a
 * person already reviewed are never overwritten.
 */
export async function translateLocale(
  deps: RuntimeDeps,
  locale: string,
  entries: Record<string, string>,
): Promise<TranslationJobProgress> {
  const { db, redis } = deps;
  const keys = Object.keys(entries);
  const progress: TranslationJobProgress = {
    status: 'running',
    total: keys.length,
    translated: 0,
    rejected: 0,
    updatedAt: new Date().toISOString(),
  };
  const report = async () => {
    progress.updatedAt = new Date().toISOString();
    await redis.set(I18N_KEYS.job(locale), JSON.stringify(progress), 'EX', 7 * 24 * 3600);
  };
  try {
    for (let offset = 0; offset < keys.length; offset += BATCH) {
      const slice = keys.slice(offset, offset + BATCH);
      const batch = Object.fromEntries(slice.map((key) => [key, entries[key]!]));
      const translated = (await translateBatch(deps, locale, batch)) ?? {};
      const reviewed = new Set(
        (
          await db.translation.findMany({
            where: { locale, key: { in: slice }, status: 'REVIEWED' },
            select: { key: true },
          })
        ).map((row) => row.key),
      );
      for (const key of slice) {
        const value = translated[key];
        if (reviewed.has(key)) continue;
        if (
          typeof value !== 'string' ||
          value.length > 5000 ||
          !isCompatibleTranslation(entries[key]!, value)
        ) {
          progress.rejected++;
          continue;
        }
        await db.translation.upsert({
          where: { locale_key: { locale, key } },
          create: { locale, key, value: value.normalize('NFC'), status: 'AUTO', updatedBy: 'ai' },
          update: { value: value.normalize('NFC'), status: 'AUTO', updatedBy: 'ai' },
        });
        progress.translated++;
      }
      await redis.incr(I18N_KEYS.version);
      await report();
    }
    progress.status = 'done';
  } catch (error) {
    progress.status = 'failed';
    deps.log.error(
      { locale, err: error instanceof Error ? error.message : String(error) },
      'automatic translation failed',
    );
  }
  await report();
  await db.auditLog.create({
    data: {
      action: 'i18n.auto_translate_finished',
      target: `locale:${locale}`,
      meta: {
        status: progress.status,
        translated: progress.translated,
        rejected: progress.rejected,
      },
    },
  });
  return progress;
}

/** Fills missing agent name/description translations (marked `auto` for review). */
export async function translateAgent(
  deps: RuntimeDeps,
  agentId: string,
  locales: string[],
): Promise<number> {
  const { db } = deps;
  let done = 0;
  for (const locale of locales) {
    const agent = await db.agent.findUnique({ where: { id: agentId } });
    if (!agent) return done;
    const localizations = (agent.localizations ?? {}) as Record<
      string,
      { name?: string; description?: string; auto?: boolean }
    >;
    const existing = localizations[locale];
    // Never replace a translation a person wrote.
    if (existing && !existing.auto && (existing.name || existing.description)) continue;
    let result: Record<string, unknown> | null = null;
    try {
      result = await translateBatch(
        deps,
        locale,
        { name: agent.name, description: agent.description },
        'its original language',
      );
    } catch (error) {
      deps.log.warn(
        { agentId, locale, err: error instanceof Error ? error.message : String(error) },
        'agent translation failed',
      );
    }
    const name = typeof result?.name === 'string' ? result.name.trim().slice(0, 120) : '';
    const description =
      typeof result?.description === 'string' ? result.description.trim().slice(0, 2000) : '';
    if (!name) continue;
    const next = { ...localizations, [locale]: { name, description, auto: true } };
    await db.agent.update({
      where: { id: agentId },
      data: { localizations: next, searchText: agentSearchText({ ...agent, localizations: next }) },
    });
    done++;
  }
  return done;
}
