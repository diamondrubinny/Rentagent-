import { defaultAgentConfig } from '@rentagent/shared';
import type { ModelMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import { buildSystemPrompt, buildUserMessage, pendingToolCalls } from '../src/loop';
import { buildHttpToolUrl, mcpToolName, toVectorLiteral } from '../src/tools';

const call = (id: string, name = 'calculator') => ({
  type: 'tool-call' as const,
  toolCallId: id,
  toolName: name,
  input: {},
});
const result = (id: string, name = 'calculator'): ModelMessage => ({
  role: 'tool',
  content: [
    { type: 'tool-result', toolCallId: id, toolName: name, output: { type: 'json', value: 1 } },
  ],
});

describe('pendingToolCalls', () => {
  it('returns unanswered calls of the latest assistant message', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'hi' },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'working' }, call('a'), call('b', 'send_email')],
      },
      result('a'),
    ];
    expect(pendingToolCalls(messages).map((c) => c.toolCallId)).toEqual(['b']);
  });

  it('ignores calls from earlier turns and plain text answers', () => {
    expect(pendingToolCalls([{ role: 'user', content: 'x' }])).toEqual([]);
    expect(pendingToolCalls([{ role: 'assistant', content: 'done' }])).toEqual([]);
    const answered: ModelMessage[] = [
      { role: 'assistant', content: [call('a')] },
      result('a'),
      { role: 'assistant', content: 'final' },
    ];
    expect(pendingToolCalls(answered)).toEqual([]);
  });
});

describe('buildSystemPrompt', () => {
  const now = new Date('2026-10-28T12:00:00Z');
  it('adds platform rules, date and language policy', () => {
    const prompt = buildSystemPrompt(defaultAgentConfig(), 'he', 'Asia/Jerusalem', now);
    expect(prompt).toContain('untrusted data');
    expect(prompt).toContain('Asia/Jerusalem');
    expect(prompt).toContain('same language as the user');
  });
  it('supports fixed and user-locale languages', () => {
    const fixed = { ...defaultAgentConfig(), language: { mode: 'fixed' as const, locale: 'ar' } };
    expect(buildSystemPrompt(fixed, 'en', 'UTC', now)).toContain('العربية (ar)');
    const user = { ...defaultAgentConfig(), language: { mode: 'user_locale' as const } };
    expect(buildSystemPrompt(user, 'ru', 'UTC', now)).toContain('(ru)');
  });
});

describe('buildUserMessage', () => {
  it('renders filled fields with labels', () => {
    const config = {
      ...defaultAgentConfig(),
      inputFields: [
        { key: 'task', label: 'Task', type: 'textarea' as const, required: true, options: [] },
        { key: 'site', label: 'Site', type: 'url' as const, required: false, options: [] },
      ],
    };
    expect(buildUserMessage(config, { task: 'Summarize', site: '' })).toBe('**Task**:\nSummarize');
  });
});

describe('buildHttpToolUrl', () => {
  it('encodes parameters and returns the rest', () => {
    const { url, rest } = buildHttpToolUrl('https://api.example.com/orders/{orderId}', {
      orderId: 'a/b?c',
      status: 'open',
    });
    expect(url.toString()).toBe('https://api.example.com/orders/a%2Fb%3Fc');
    expect(rest).toEqual({ status: 'open' });
  });
  it('prevents parameters from changing the host', () => {
    expect(() => buildHttpToolUrl('https://{host}/x', { host: 'evil.com' })).toThrow();
    const { url } = buildHttpToolUrl('https://api.example.com/{p}', { p: '@evil.com' });
    expect(url.hostname).toBe('api.example.com');
  });
});

describe('helpers', () => {
  it('sanitizes MCP tool names and formats vectors', () => {
    expect(mcpToolName('crm', 'find contact!')).toBe('crm__find_contact_');
    expect(toVectorLiteral([0.5, Number.NaN, -1])).toBe('[0.5,0,-1]');
  });
});
