import { APICallError } from 'ai';
import { describe, expect, it } from 'vitest';
import { classifyError } from '../src/errors';
import { AllCandidatesFailedError, orderCandidates, runWithFallback } from '../src/router';

const apiError = (statusCode: number, responseBody = '') =>
  new APICallError({
    message: 'x',
    url: 'https://api.test',
    requestBodyValues: {},
    statusCode,
    responseBody,
  });

describe('orderCandidates', () => {
  const models = [
    { id: 'a', costScore: 10, latencyMs: 900 },
    { id: 'b', costScore: null, latencyMs: 200 },
    { id: 'c', costScore: 2, latencyMs: null },
    { id: 'd', costScore: 2, latencyMs: 500 },
  ];
  it('keeps operator order for FIXED', () => {
    expect(orderCandidates('FIXED', models).map((m) => m.id)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('sorts by cost with unknowns last and stable ties', () => {
    expect(orderCandidates('CHEAPEST', models).map((m) => m.id)).toEqual(['c', 'd', 'a', 'b']);
  });
  it('sorts by latency with unknowns last', () => {
    expect(orderCandidates('FASTEST', models).map((m) => m.id)).toEqual(['b', 'd', 'a', 'c']);
  });
});

describe('classifyError', () => {
  it.each([
    [401, 'auth', true],
    [403, 'auth', true],
    [429, 'rate_limit', true],
    [500, 'server', true],
    [503, 'server', true],
    [404, 'not_found', true],
    [400, 'invalid_request', false],
    [422, 'invalid_request', false],
  ] as const)('%i → %s', (status, kind, fallback) => {
    expect(classifyError(apiError(status))).toMatchObject({ kind, fallback });
  });
  it('detects content filtering', () => {
    expect(classifyError(apiError(400, '{"error":"content policy violation"}')).kind).toBe(
      'content_filter',
    );
  });
  it('treats network and abort errors as retryable', () => {
    expect(classifyError(Object.assign(new Error('x'), { code: 'ECONNREFUSED' }))).toMatchObject({
      kind: 'network',
      fallback: true,
    });
    expect(classifyError(Object.assign(new Error('x'), { name: 'TimeoutError' })).kind).toBe(
      'timeout',
    );
    expect(classifyError('weird').fallback).toBe(false);
  });
});

describe('runWithFallback', () => {
  it('falls back on retryable errors and reports attempts', async () => {
    const seen: string[] = [];
    const { result, attempts } = await runWithFallback(['a', 'b', 'c'], async (c) => {
      seen.push(c);
      if (c === 'a') throw apiError(429);
      if (c === 'b') throw apiError(503);
      return `ok:${c}`;
    });
    expect(result).toBe('ok:c');
    expect(seen).toEqual(['a', 'b', 'c']);
    expect(attempts.map((a) => a.error?.kind ?? 'ok')).toEqual(['rate_limit', 'server', 'ok']);
  });

  it('stops immediately on request errors', async () => {
    const seen: string[] = [];
    await expect(
      runWithFallback(['a', 'b'], async (c) => {
        seen.push(c);
        throw apiError(400);
      }),
    ).rejects.toBeInstanceOf(AllCandidatesFailedError);
    expect(seen).toEqual(['a']);
  });

  it('throws when every candidate fails', async () => {
    await expect(
      runWithFallback(['a', 'b'], async () => {
        throw apiError(500);
      }),
    ).rejects.toMatchObject({
      attempts: [{ candidate: 'a' }, { candidate: 'b' }],
    });
  });
});
