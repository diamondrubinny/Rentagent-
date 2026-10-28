import { z } from 'zod';
import { canonicalizeLocale } from './i18n';
import { foldForSearch, normalizeSingleLine } from './text';

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

/** Positive decimal amount with up to 6 decimals, e.g. "0.25". */
const priceString = z
  .string()
  .trim()
  .regex(/^(?:0|[1-9]\d{0,8})(?:\.\d{1,6})?$/, { error: 'invalidDecimal' })
  .refine((value) => Number(value) > 0, { error: 'invalidDecimal' });

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
    /**
     * What users pay per task when billing is on, in the installation's base currency.
     * usage = model prices of the tokens used, capped at maxPerTask; per_task = fixed,
     * charged only when the task succeeds.
     */
    pricing: z
      .object({
        mode: z.enum(['free', 'usage', 'per_task']),
        perTask: priceString.nullable(),
        maxPerTask: priceString.nullable(),
      })
      .default({ mode: 'usage', perTask: null, maxPerTask: '1' })
      .superRefine((pricing, ctx) => {
        if (pricing.mode === 'per_task' && !pricing.perTask)
          ctx.addIssue({ code: 'custom', path: ['perTask'], message: 'required' });
        if (pricing.mode === 'usage' && !pricing.maxPerTask)
          ctx.addIssue({ code: 'custom', path: ['maxPerTask'], message: 'required' });
      }),
    /** Follow-up messages after the first task; older configs get the defaults. */
    conversation: z
      .object({
        followUps: z.boolean(),
        /** Previous turns (user message + answer) sent with each follow-up. */
        historyTurns: z.number().int().min(1).max(50),
      })
      .default({ followUps: true, historyTurns: 10 }),
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
    pricing: { mode: 'usage', perTask: null, maxPerTask: '1' },
    conversation: { followUps: true, historyTurns: 10 },
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
      z.object({
        name: z.string().trim().max(120),
        description: z.string().trim().max(2000),
        /** Machine-translated and not yet reviewed by a person. */
        auto: z.boolean().optional(),
      }),
    )
    .default({}),
});

export type AgentLocalizations = Record<string, { name?: string; description?: string }>;

/** Everything a visitor might search for, in every language the agent is described in. */
export function agentSearchDocument(agent: {
  name: string;
  description: string;
  localizations: unknown;
  category?: string;
}): string {
  const localized = Object.values((agent.localizations ?? {}) as AgentLocalizations);
  return [
    agent.name,
    agent.description,
    ...localized.flatMap((l) => [l.name, l.description]),
    agent.category,
  ]
    .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
    .join('\n');
}

/** Folded search column value (see foldForSearch). */
export const agentSearchText = (agent: Parameters<typeof agentSearchDocument>[0]) =>
  foldForSearch(agentSearchDocument(agent));

/** Name and description in the visitor's language, falling back to the defaults. */
export function localizedAgent(
  agent: { name: string; description: string; localizations: unknown },
  locale: string,
): { name: string; description: string } {
  const localized = ((agent.localizations ?? {}) as AgentLocalizations)[locale];
  return {
    name: localized?.name?.trim() || agent.name,
    description: localized?.description?.trim() || agent.description,
  };
}

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
