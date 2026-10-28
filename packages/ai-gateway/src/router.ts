import { classifyError, type ClassifiedError } from './errors';

export type Strategy = 'FIXED' | 'CHEAPEST' | 'FASTEST';

export interface RoutableModel {
  id: string;
  /** Combined provider cost per 1M tokens (input + output), used by CHEAPEST. */
  costScore: number | null;
  /** Observed average latency in ms, used by FASTEST. */
  latencyMs: number | null;
}

/**
 * Orders candidate models. Unknown cost/latency sort last; ties keep the
 * operator's configured order (stable sort), which is also the FIXED order.
 */
export function orderCandidates<T extends RoutableModel>(strategy: Strategy, models: T[]): T[] {
  if (strategy === 'FIXED') return [...models];
  const metric = (model: T) => (strategy === 'CHEAPEST' ? model.costScore : model.latencyMs);
  return models
    .map((model, index) => ({ model, index, value: metric(model) }))
    .sort((a, b) => {
      if (a.value === null && b.value === null) return a.index - b.index;
      if (a.value === null) return 1;
      if (b.value === null) return -1;
      return a.value - b.value || a.index - b.index;
    })
    .map((entry) => entry.model);
}

export interface Attempt<C> {
  candidate: C;
  error?: ClassifiedError;
}

export class AllCandidatesFailedError extends Error {
  constructor(readonly attempts: Attempt<unknown>[]) {
    super(`All ${attempts.length} candidate(s) failed`);
    this.name = 'AllCandidatesFailedError';
  }
}

/**
 * Runs `run` against candidates in order, moving to the next one only for errors
 * where another model/key can help (rate limits, outages, auth). Errors caused by
 * the request itself are thrown immediately.
 */
export async function runWithFallback<C, R>(
  candidates: C[],
  run: (candidate: C, attempt: number) => Promise<R>,
  onError?: (candidate: C, error: ClassifiedError, raw: unknown) => void | Promise<void>,
): Promise<{ result: R; attempts: Attempt<C>[] }> {
  const attempts: Attempt<C>[] = [];
  for (const [index, candidate] of candidates.entries()) {
    try {
      const result = await run(candidate, index + 1);
      attempts.push({ candidate });
      return { result, attempts };
    } catch (raw) {
      const error = classifyError(raw);
      attempts.push({ candidate, error });
      await onError?.(candidate, error, raw);
      if (!error.fallback)
        throw Object.assign(new AllCandidatesFailedError(attempts), { cause: raw });
    }
  }
  throw new AllCandidatesFailedError(attempts);
}
