'use server';

import { isSupportedLocale } from '@rentagent/shared';
import { settingUpsert } from '@rentagent/db';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { type ActionResult, authorizeAction } from '@/lib/server/admin-action';
import { audit } from '@/lib/server/audit';
import {
  getLegalSettings,
  LEGAL_PAGES,
  LEGAL_OVERRIDE_MAX_CHARS,
  type LegalSettings,
} from '@/lib/server/legal';
import { db } from '@/lib/server/runtime';

export type LegalResult = ActionResult & { fieldErrors?: Record<string, string> };

const forbidden = { ok: false, error: 'forbidden' } as const;
const text = (max: number) => z.string().trim().max(max, { error: 'tooLong' });
const optionalEmail = z.union([z.literal(''), z.email({ error: 'invalidEmail' }).max(254)]);

const detailsSchema = z.object({
  company: text(200),
  address: text(300),
  country: text(100),
  contactEmail: optionalEmail,
  privacyEmail: optionalEmail,
  dpoName: text(120),
  accessibilityName: text(120),
  accessibilityEmail: optionalEmail,
  accessibilityPhone: z
    .string()
    .trim()
    .regex(/^[+\d\s().-]{0,30}$/, { error: 'invalidPhone' }),
  accessibilityResponseDays: z.coerce
    .number({ error: 'invalidNumber' })
    .int({ error: 'invalidNumber' })
    .min(1, { error: 'invalidNumber' })
    .max(90, { error: 'invalidNumber' }),
});

function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) errors[String(issue.path[0] ?? 'form')] ??= issue.message;
  return errors;
}

async function store(next: LegalSettings, actorId: string) {
  await db().setting.upsert(
    settingUpsert('legal', { ...next, updatedAt: new Date().toISOString() }, actorId),
  );
  revalidatePath('/', 'layout');
}

/** Operator identity and contact details shown in the documents. */
export async function saveLegalDetails(
  input: Record<keyof z.infer<typeof detailsSchema>, string>,
): Promise<LegalResult> {
  const actor = await authorizeAction('settings.manage');
  if (!actor) return forbidden;
  const parsed = detailsSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: 'invalid', fieldErrors: fieldErrorsOf(parsed.error) };
  const current = await getLegalSettings();
  await store({ ...current, ...parsed.data }, actor.id);
  await audit('legal.details_updated', { actorId: actor.id });
  return { ok: true };
}

const pageSchema = z.object({
  page: z.enum(LEGAL_PAGES),
  reviewed: z.boolean(),
  overrides: z.record(
    z.string().refine(isSupportedLocale),
    z.string().max(LEGAL_OVERRIDE_MAX_CHARS, { error: 'tooLong' }),
  ),
});

/**
 * Saves one document's own texts (empty = use the draft) and whether a qualified
 * professional reviewed it. Locales not sent keep their stored text.
 */
export async function saveLegalPage(input: {
  page: string;
  reviewed: boolean;
  overrides: Record<string, string>;
}): Promise<LegalResult> {
  const actor = await authorizeAction('settings.manage');
  if (!actor) return forbidden;
  const parsed = pageSchema.safeParse(input);
  if (!parsed.success) {
    const tooLong = parsed.error.issues.find((issue) => issue.message === 'tooLong');
    return tooLong
      ? { ok: false, error: 'invalid', fieldErrors: { [String(tooLong.path[1])]: 'tooLong' } }
      : { ok: false, error: 'invalid' };
  }
  const { page, reviewed } = parsed.data;
  const current = await getLegalSettings();
  const texts = { ...current.overrides[page] };
  for (const [locale, value] of Object.entries(parsed.data.overrides)) {
    const trimmed = value.trim();
    if (trimmed) texts[locale] = trimmed;
    else delete texts[locale];
  }
  await store(
    {
      ...current,
      reviewed: { ...current.reviewed, [page]: reviewed },
      overrides: { ...current.overrides, [page]: texts },
    },
    actor.id,
  );
  await audit('legal.page_updated', {
    actorId: actor.id,
    target: `legal:${page}`,
    meta: { reviewed, customLocales: Object.keys(texts).sort() },
  });
  return { ok: true };
}
