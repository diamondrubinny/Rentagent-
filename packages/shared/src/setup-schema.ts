import { z } from 'zod';
import { emailField, nameField, passwordField } from './auth';
import { BUILTIN_LOCALES, isValidTimeZone } from './i18n';
import { isSupportedCurrency } from './money';
import { normalizeSingleLine } from './text';

/**
 * Validation messages are i18n keys under the "validation" namespace so the
 * same schema can be used on the server and translated on the client.
 */
const singleLine = (max: number) =>
  z
    .string()
    .transform(normalizeSingleLine)
    .pipe(z.string().min(1, { error: 'required' }).max(max, { error: 'tooLong' }));

const optionalSingleLine = (max: number) =>
  z
    .string()
    .optional()
    .transform((value) => (value ? normalizeSingleLine(value) : ''))
    .pipe(z.string().max(max, { error: 'tooLong' }));

const checkbox = z
  .enum(['on', 'true', ''])
  .optional()
  .transform((value) => value === 'on' || value === 'true');

export const SMTP_SECURITY = ['tls', 'starttls', 'none'] as const;

export const setupSchema = z
  .object({
    token: z.string().min(1, { error: 'required' }).max(512, { error: 'tooLong' }),
    ownerName: nameField,
    ownerEmail: emailField,
    ownerPassword: passwordField,
    ownerPasswordConfirm: z.string(),
    siteName: singleLine(80),
    defaultLocale: z.enum(BUILTIN_LOCALES, { error: 'invalidOption' }),
    baseCurrency: z
      .string()
      .transform((value) => value.trim().toUpperCase())
      .refine(isSupportedCurrency, { error: 'invalidCurrency' }),
    timeZone: z
      .string()
      .transform((value) => value.trim())
      .refine(isValidTimeZone, { error: 'invalidTimeZone' }),
    licenseKey: optionalSingleLine(200),
    smtpEnabled: checkbox,
    smtpHost: optionalSingleLine(253),
    smtpPort: z
      .string()
      .optional()
      .transform((value) => (value ? Number(value) : 587))
      .pipe(
        z
          .number()
          .int({ error: 'invalidPort' })
          .min(1, { error: 'invalidPort' })
          .max(65535, { error: 'invalidPort' }),
      ),
    smtpSecurity: z.enum(SMTP_SECURITY, { error: 'invalidOption' }).default('starttls'),
    smtpUser: optionalSingleLine(320),
    smtpPassword: z.string().max(1024, { error: 'tooLong' }).optional().default(''),
    smtpFromEmail: optionalSingleLine(320),
    smtpFromName: optionalSingleLine(120),
  })
  .superRefine((data, ctx) => {
    if (data.ownerPassword !== data.ownerPasswordConfirm) {
      ctx.addIssue({ code: 'custom', path: ['ownerPasswordConfirm'], message: 'passwordMismatch' });
    }
    if (!data.smtpEnabled) return;
    if (!data.smtpHost) ctx.addIssue({ code: 'custom', path: ['smtpHost'], message: 'required' });
    if (!z.email().safeParse(data.smtpFromEmail).success) {
      ctx.addIssue({ code: 'custom', path: ['smtpFromEmail'], message: 'invalidEmail' });
    }
  });

export type SetupInput = z.input<typeof setupSchema>;
export type SetupData = z.output<typeof setupSchema>;
