import type { ModelMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import { conversationTitle, followUpMessages, splitTurns } from '../src/conversation';

const turn = (n: number, withTool = false): ModelMessage[] => [
  { role: 'user', content: `question ${n}` },
  ...(withTool
    ? ([
        {
          role: 'assistant',
          content: [{ type: 'tool-call', toolCallId: `c${n}`, toolName: 'calculator', input: {} }],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: `c${n}`,
              toolName: 'calculator',
              output: { type: 'json', value: n },
            },
          ],
        },
      ] as ModelMessage[])
    : []),
  { role: 'assistant', content: `answer ${n}` },
];

describe('splitTurns', () => {
  it('starts a turn at every user message', () => {
    const turns = splitTurns([...turn(1, true), ...turn(2)]);
    expect(turns.map((t) => t.length)).toEqual([4, 2]);
  });
});

describe('followUpMessages', () => {
  it('keeps the latest complete turns and appends the new message', () => {
    const history = [...turn(1, true), ...turn(2), ...turn(3, true)];
    const messages = followUpMessages(history, 'next', { historyTurns: 2 });
    expect(messages[0]).toEqual({ role: 'user', content: 'question 2' });
    expect(messages.at(-1)).toEqual({ role: 'user', content: 'next' });
    // The tool call of turn 3 travels with its result.
    expect(messages.filter((m) => m.role === 'tool')).toHaveLength(1);
    expect(messages).toHaveLength(2 + 4 + 1);
  });

  it('drops older turns over the size cap but always keeps the latest one', () => {
    const big = (n: number): ModelMessage[] => [
      { role: 'user', content: 'x'.repeat(500) + n },
      { role: 'assistant', content: 'y'.repeat(500) },
    ];
    const messages = followUpMessages([...big(1), ...big(2)], 'next', {
      historyTurns: 10,
      maxChars: 600,
    });
    expect(messages).toHaveLength(3);
    expect(String(messages[0]!.content).endsWith('2')).toBe(true);
  });

  it('ignores leading non-user messages', () => {
    const messages = followUpMessages(
      [{ role: 'assistant', content: 'orphan' }, ...turn(1)],
      'next',
      { historyTurns: 5 },
    );
    expect(messages[0]).toEqual({ role: 'user', content: 'question 1' });
  });
});

describe('conversationTitle', () => {
  it('uses the first non-empty input on one line, truncated', () => {
    expect(conversationTitle({ a: '  ', b: 'Hello\n  world' }, 'Agent')).toBe('Hello world');
    expect(conversationTitle({}, 'Agent')).toBe('Agent');
    expect(conversationTitle({ a: 'z'.repeat(200) }, 'Agent')).toHaveLength(80);
  });
});
