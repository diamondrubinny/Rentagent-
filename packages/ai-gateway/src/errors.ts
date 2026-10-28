import { APICallError } from 'ai';

export type ErrorKind =
  | 'auth'
  | 'rate_limit'
  | 'server'
  | 'timeout'
  | 'network'
  | 'invalid_request'
  | 'not_found'
  | 'content_filter'
  | 'cancelled'
  | 'unknown';

export interface ClassifiedError {
  kind: ErrorKind;
  /** Whether trying another model/key may succeed. */
  fallback: boolean;
  status?: number;
}

/**
 * Normalizes provider errors. Raw messages are never surfaced to end users because
 * they can contain request details; only the kind is.
 */
/**
 * Wraps an error raised after part of a streamed answer was already delivered:
 * switching to another model then would produce a mixed answer, so no fallback.
 */
export class AfterOutputError extends Error {
  constructor(readonly inner: unknown) {
    super('failed after output started');
    this.name = 'AfterOutputError';
  }
}

export function classifyError(error: unknown): ClassifiedError {
  if (error instanceof AfterOutputError) return { ...classifyError(error.inner), fallback: false };
  if (APICallError.isInstance(error)) {
    const status = error.statusCode;
    if (status === 401 || status === 403) return { kind: 'auth', fallback: true, status };
    if (status === 429) return { kind: 'rate_limit', fallback: true, status };
    if (status === 404) return { kind: 'not_found', fallback: true, status };
    if (status === 408) return { kind: 'timeout', fallback: true, status };
    if (status !== undefined && status >= 500) return { kind: 'server', fallback: true, status };
    if (status === 400 && /content|safety|policy/i.test(error.responseBody ?? '')) {
      return { kind: 'content_filter', fallback: false, status };
    }
    if (status !== undefined && status >= 400)
      return { kind: 'invalid_request', fallback: false, status };
    return { kind: error.isRetryable ? 'network' : 'unknown', fallback: error.isRetryable };
  }
  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError')
      return { kind: 'timeout', fallback: true };
    const code =
      (error as Error & { code?: string; cause?: { code?: string } }).code ??
      (error as Error & { cause?: { code?: string } }).cause?.code;
    if (code && /^(ECONN|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|EHOSTUNREACH|UND_ERR)/.test(code)) {
      return { kind: 'network', fallback: true };
    }
    if (/fetch failed|network/i.test(error.message)) return { kind: 'network', fallback: true };
  }
  return { kind: 'unknown', fallback: false };
}
