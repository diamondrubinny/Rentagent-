import { z } from 'zod';
import { canonicalizeLocale } from './i18n';
import { normalizeSingleLine } from './text';

export const BUILTIN_TOOLS = [
  'calculator',
  'current_time',
  'web_fetch',
  'knowledge_search',
  'send_email',
] as const;
export type BuiltinTool = (typeof BUILTIN_TOOLS)[number];

/** Tools with side effects outside the platform require approval unless the operator opts out. */
export const SIDE_EFFECT_BUILTINS: readonly BuiltinTool[] = ['send_email'];

export const AGENT_CATEGORIES = [
  'support',
  'research',
  'content',
  'documents',
  'meetings',
  'sales',
  'reports',
  'translation',
  'other',
] as const;

export const INPUT_FIELD_TYPES = ['text', 'textarea', 'url', 'email', 'number', 'select'] as const;

const uuid = z.uuid();
const singleLine = (max: number) =>
  z
    .string()
    .transform(normalizeSingleLine)
    .pipe(z.string().min(1, { error: 'required' }).max(max, { error: 'tooLong' }));

const toolIdPattern = new RegExp(
  `^(${BUILTIN_TOOLS.join('|')}|http:[0-9a-f-]{36}|mcp:[0-9a-f-]{36})$`,
);

export const toolRefSchema = z.object({
  id: z.string().regex(toolIdPattern, { error: 'invalidTool' }),
  approval: z.enum(['never', 'always']),
});

export const inputFieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, { error: 'invalidKey' }),
  label: singleLine(120),
  type: z.enum(INPUT_FIELD_TYPES),
  required: z.boolean(),
  options: z.array(singleLine(120)).max(30).default([]),
});

const hostname = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(\*\.)?([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, { error: 'invalidDomain' });

export const agentConfigSchema = z
  .object({
    formatVersion: z.literal(1),
    instructions: z.string().trim().min(1, { error: 'required' }).max(20_000, { error: 'tooLong' }),
    target: z.discriminatedUnion('type', [
      z.object({ type: z.literal('default') }),
      z.object({ type: z.literal('policy'), id: uuid }),
      z.object({ type: z.literal('model'), id: uuid }),
    ]),
    tools: z.array(toolRefSchema).max(30),
    inputFields: z.array(inputFieldSchema).max(20),
    language: z.object({
      mode: z.enum(['match_user', 'fixed', 'user_locale']),
      locale: z
        .string()
        .optional()
        .refine((value) => !value || canonicalizeLocale(value) !== null, {
          error: 'invalidLocale',
        }),
    }),
    limits: z.object({
      maxSteps: z.number().int().min(1).max(25),
      maxOutputTokens: z.number().int().min(64).max(32_000),
      /** USD (provider cost) per run; null = unlimited. */
      maxCostUsd: z
        .string()
        .regex(/^\d{1,6}(\.\d{1,6})?$/, { error: 'invalidDecimal' })
        .nullable(),
      timeoutSeconds: z.number().int().min(30).max(1800),
    }),
    fetchAllowedDomains: z.array(hostname).max(50),
    outputFormat: z.enum(['markdown', 'text']),
    temperature: z.number().min(0).max(2).nullable(),
  })
  .superRefine((config, ctx) => {
    const toolIds = config.tools.map((tool) => tool.id);
    if (new Set(toolIds).size !== toolIds.length) {
      ctx.addIssue({ code: 'custom', path: ['tools'], message: 'duplicateTool' });
    }
    const keys = config.inputFields.map((field) => field.key);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({ code: 'custom', path: ['inputFields'], message: 'duplicateKey' });
    }
    config.inputFields.forEach((field, index) => {
      if (field.type === 'select' && field.options.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['inputFields', index, 'options'],
          message: 'optionsRequired',
        });
      }
    });
    if (config.language.mode === 'fixed' && !config.language.locale) {
      ctx.addIssue({ code: 'custom', path: ['language', 'locale'], message: 'required' });
    }
  });

export type AgentConfig = z.output<typeof agentConfigSchema>;
export type AgentInputField = z.output<typeof inputFieldSchema>;

export function defaultAgentConfig(): AgentConfig {
  return {
    formatVersion: 1,
    instructions:
      'You are a helpful assistant. Complete the task described by the user accurately and concisely.',
    target: { type: 'default' },
    tools: [],
    inputFields: [{ key: 'task', label: 'Task', type: 'textarea', required: true, options: [] }],
    language: { mode: 'match_user' },
    limits: { maxSteps: 8, maxOutputTokens: 2000, maxCostUsd: '0.50', timeoutSeconds: 300 },
    fetchAllowedDomains: [],
    outputFormat: 'markdown',
    temperature: null,
  };
}

export const agentMetaSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]([a-z0-9-]{1,78}[a-z0-9])$/, { error: 'invalidSlug' }),
  name: singleLine(120),
  category: z.enum(AGENT_CATEGORIES),
  description: z.string().trim().max(2000, { error: 'tooLong' }),
  localizations: z
    .record(
      z.string().refine((key) => canonicalizeLocale(key) !== null),
      z.object({ name: z.string().trim().max(120), description: z.string().trim().max(2000) }),
    )
    .default({}),
});

/** Portable agent definition for import/export between installations. */
export const agentExportSchema = agentMetaSchema.extend({
  format: z.literal('rentagent.agent'),
  formatVersion: z.literal(1),
  config: agentConfigSchema,
});
export type AgentExport = z.output<typeof agentExportSchema>;

/** Validates run input against the agent's form fields. */
export function runInputSchema(fields: AgentInputField[]) {
  const shape: Record<string, z.ZodType> = {};
  for (const field of fields) {
    let schema: z.ZodType;
    switch (field.type) {
      case 'number':
        schema = z.coerce.number({ error: 'invalidNumber' }).finite();
        break;
      case 'email':
        schema = z.email({ error: 'invalidEmail' });
        break;
      case 'url':
        schema = z.url({ protocol: /^https?$/, error: 'invalidUrl' });
        break;
      case 'select':
        schema = z.enum(field.options as [string, ...string[]], { error: 'invalidOption' });
        break;
      default:
        schema = z.string().max(field.type === 'textarea' ? 20_000 : 1_000, { error: 'tooLong' });
    }
    if (field.required) {
      shape[field.key] =
        field.type === 'number' || field.type === 'select'
          ? schema
          : z
              .string()
              .trim()
              .min(1, { error: 'required' })
              .pipe(schema as z.ZodType<string, string>);
    } else {
      shape[field.key] = z.preprocess(
        (value) => (value === '' ? undefined : value),
        schema.optional(),
      );
    }
  }
  return z.object(shape);
}
