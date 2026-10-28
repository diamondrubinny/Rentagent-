import { z } from 'zod';
import { canonicalizeLocale } from './i18n';
import { normalizeSingleLine } from './text';

/** Non-negative decimal with up to 6 fraction digits, as a string (prices per 1M tokens). */
export const decimalPriceField = z
  .string()
  .trim()
  .refine((value) => value === '' || /^\d{1,8}(\.\d{1,6})?$/.test(value), {
    error: 'invalidDecimal',
  })
  .transform((value) => (value === '' ? null : value));

export const modelFormSchema = z.object({
  modelId: z
    .string()
    .transform(normalizeSingleLine)
    .pipe(z.string().min(1, { error: 'required' }).max(200, { error: 'tooLong' })),
  displayName: z
    .string()
    .transform(normalizeSingleLine)
    .pipe(z.string().min(1, { error: 'required' }).max(120, { error: 'tooLong' })),
  kind: z.enum(['CHAT', 'EMBEDDING'], { error: 'invalidOption' }),
  tools: z.boolean(),
  vision: z.boolean(),
  json: z.boolean(),
  reasoning: z.boolean(),
  contextWindow: z
    .string()
    .trim()
    .refine((value) => value === '' || /^\d{1,9}$/.test(value), { error: 'invalidNumber' })
    .transform((value) => (value === '' ? null : Number(value))),
  languages: z
    .string()
    .transform((value) =>
      value
        .split(/[,\s]+/)
        .map((code) => code.trim())
        .filter(Boolean),
    )
    .refine(
      (codes) => codes.length <= 50 && codes.every((code) => canonicalizeLocale(code) !== null),
      {
        error: 'invalidLanguages',
      },
    )
    .transform((codes) => [...new Set(codes.map((code) => canonicalizeLocale(code) as string))]),
  costInPer1M: decimalPriceField,
  costOutPer1M: decimalPriceField,
  priceInPer1M: decimalPriceField,
  priceOutPer1M: decimalPriceField,
  visible: z.boolean(),
  enabled: z.boolean(),
});

export type ModelFormInput = z.input<typeof modelFormSchema>;
