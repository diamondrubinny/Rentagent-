import type { ModelMessage } from 'ai';

/** Upper bound for history sent with a follow-up (characters of serialized messages). */
export const HISTORY_MAX_CHARS = 120_000;
export const USER_MESSAGE_MAX_CHARS = 8_000;

/** Splits messages into turns; each turn starts with a user message. */
export function splitTurns(messages: ModelMessage[]): ModelMessage[][] {
  const turns: ModelMessage[][] = [];
  for (const message of messages) {
    if (message.role === 'user' || turns.length === 0) turns.push([message]);
    else turns.at(-1)!.push(message);
  }
  return turns;
}

/**
 * Builds the messages for a follow-up turn: the most recent complete turns of the
 * previous run (never splitting a tool call from its result) plus the new user text.
 */
export function followUpMessages(
  /** Stored messages of the previous run (JSON from the database). */
  previous: unknown,
  userText: string,
  options: { historyTurns: number; maxChars?: number },
): ModelMessage[] {
  const maxChars = options.maxChars ?? HISTORY_MAX_CHARS;
  const history = Array.isArray(previous) ? (previous as ModelMessage[]) : [];
  const turns = splitTurns(history).filter((turn) => turn[0]!.role === 'user');
  const kept: ModelMessage[][] = [];
  let size = 0;
  for (let index = turns.length - 1; index >= 0 && kept.length < options.historyTurns; index--) {
    const turnSize = JSON.stringify(turns[index]).length;
    if (kept.length > 0 && size + turnSize > maxChars) break;
    kept.unshift(turns[index]!);
    size += turnSize;
  }
  return [...kept.flat(), { role: 'user', content: userText }];
}

/** Short single-line conversation title from the first task input. */
export function conversationTitle(input: Record<string, unknown>, fallback: string): string {
  const first = Object.values(input).find(
    (value): value is string => typeof value === 'string' && value.trim() !== '',
  );
  const line = (first ?? fallback).replace(/\s+/g, ' ').trim();
  return line.length > 80 ? `${line.slice(0, 79)}…` : line;
}
