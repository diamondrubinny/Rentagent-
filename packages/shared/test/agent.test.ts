import { describe, expect, it } from 'vitest';
import {
  agentConfigSchema,
  agentExportSchema,
  defaultAgentConfig,
  runInputSchema,
} from '../src/agent';

describe('agentConfigSchema', () => {
  it('accepts the default config', () => {
    expect(agentConfigSchema.safeParse(defaultAgentConfig()).success).toBe(true);
  });

  it('rejects unknown tools, duplicates and bad limits', () => {
    const config = defaultAgentConfig();
    const bad = {
      ...config,
      tools: [
        { id: 'shell_exec', approval: 'never' },
        { id: 'calculator', approval: 'never' },
        { id: 'calculator', approval: 'always' },
      ],
      limits: { ...config.limits, maxSteps: 500 },
    };
    const result = agentConfigSchema.safeParse(bad);
    expect(result.success).toBe(false);
    const messages = result.error?.issues.map(
      (issue) => `${issue.path.join('.')}:${issue.message}`,
    );
    expect(messages).toEqual(expect.arrayContaining(['tools.0.id:invalidTool']));
    expect(messages?.some((message) => message.startsWith('limits.maxSteps'))).toBe(true);
  });

  it('accepts http and mcp tool references by id', () => {
    const config = {
      ...defaultAgentConfig(),
      tools: [
        { id: 'http:4f9a1c2e-1111-4a5b-9c8d-123456789abc', approval: 'always' },
        { id: 'mcp:4f9a1c2e-2222-4a5b-9c8d-123456789abc', approval: 'always' },
      ],
    };
    expect(agentConfigSchema.safeParse(config).success).toBe(true);
  });

  it('requires options for select fields and a locale for fixed language', () => {
    const config = {
      ...defaultAgentConfig(),
      inputFields: [{ key: 'tone', label: 'Tone', type: 'select', required: true, options: [] }],
      language: { mode: 'fixed' },
    };
    const messages = agentConfigSchema
      .safeParse(config)
      .error?.issues.map((issue) => issue.message);
    expect(messages).toEqual(expect.arrayContaining(['optionsRequired', 'required']));
  });

  it('validates domain allowlists', () => {
    const ok = { ...defaultAgentConfig(), fetchAllowedDomains: ['example.com', '*.gov.il'] };
    expect(agentConfigSchema.safeParse(ok).success).toBe(true);
    const bad = { ...defaultAgentConfig(), fetchAllowedDomains: ['http://example.com/path'] };
    expect(agentConfigSchema.safeParse(bad).success).toBe(false);
  });
});

describe('agentExportSchema', () => {
  it('round-trips a valid export', () => {
    const data = {
      format: 'rentagent.agent',
      formatVersion: 1,
      slug: 'support-bot',
      name: 'Support bot',
      category: 'support',
      description: '',
      localizations: { he: { name: 'בוט תמיכה', description: '' } },
      config: defaultAgentConfig(),
    };
    expect(agentExportSchema.parse(data).slug).toBe('support-bot');
    expect(agentExportSchema.safeParse({ ...data, format: 'other' }).success).toBe(false);
  });
});

describe('runInputSchema', () => {
  const schema = runInputSchema([
    { key: 'task', label: 'Task', type: 'textarea', required: true, options: [] },
    { key: 'site', label: 'Site', type: 'url', required: false, options: [] },
    { key: 'count', label: 'Count', type: 'number', required: false, options: [] },
    { key: 'tone', label: 'Tone', type: 'select', required: true, options: ['formal', 'friendly'] },
  ]);

  it('accepts valid input and coerces numbers', () => {
    const result = schema.parse({ task: 'Do it', site: '', count: '3', tone: 'formal' });
    expect(result).toEqual({ task: 'Do it', count: 3, tone: 'formal' });
  });

  it('rejects missing required fields, bad URLs and unknown options', () => {
    const result = schema.safeParse({ task: '  ', site: 'javascript:alert(1)', tone: 'rude' });
    const paths = result.error?.issues.map((issue) => issue.path.join('.'));
    expect(paths).toEqual(expect.arrayContaining(['task', 'site', 'tone']));
  });
});

describe('foldForSearch', () => {
  it('folds case, accents, niqqud, harakat and tatweel', async () => {
    const { foldForSearch, searchTerms } = await import('../src/text');
    expect(foldForSearch('Café  RÉSUMÉ!')).toBe('cafe resume');
    expect(foldForSearch('שָׁלוֹם')).toBe('שלום');
    expect(foldForSearch('مَرْحَبًا')).toBe('مرحبا');
    expect(foldForSearch('عـــربي')).toBe('عربي');
    expect(foldForSearch('ＡＢＣ１')).toBe('abc1');
    expect(searchTerms('a sales SALES agent')).toEqual(['sales', 'agent']);
  });

  it('gives older configs the conversation defaults', () => {
    const { conversation, ...legacy } = defaultAgentConfig();
    expect(conversation.followUps).toBe(true);
    expect(agentConfigSchema.parse(legacy).conversation).toEqual({
      followUps: true,
      historyTurns: 10,
    });
  });
});

describe('agent search text', () => {
  it('covers every language and the category', async () => {
    const { agentSearchText, localizedAgent } = await import('../src/agent');
    const agent = {
      name: 'Translator',
      description: 'Translates text.',
      category: 'translation',
      localizations: { he: { name: 'מְתַרְגֵּם', description: '' }, ar: { name: 'مترجم' } },
    };
    expect(agentSearchText(agent)).toBe('translator translates text מתרגם مترجم translation');
    expect(localizedAgent(agent, 'ar')).toEqual({ name: 'مترجم', description: 'Translates text.' });
    expect(localizedAgent(agent, 'ru').name).toBe('Translator');
  });
});
