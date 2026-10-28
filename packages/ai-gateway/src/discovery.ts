import { effectiveBaseUrl, PROVIDERS } from './catalog';
import type { ProviderConnection } from './factory';

export interface DiscoveredModel {
  modelId: string;
  displayName: string;
  kind: 'CHAT' | 'EMBEDDING';
  contextWindow?: number;
  /** USD per 1M tokens, when the provider publishes it (OpenRouter). Must be verified by the operator. */
  costInPer1M?: string;
  costOutPer1M?: string;
}

export class DiscoveryUnsupportedError extends Error {
  constructor() {
    super('Model discovery is not supported for this provider');
    this.name = 'DiscoveryUnsupportedError';
  }
}

const MAX_PAGES = 10;
const TIMEOUT_MS = 15_000;

const guessKind = (id: string): DiscoveredModel['kind'] =>
  /embed/i.test(id) ? 'EMBEDDING' : 'CHAT';

/** Per-token USD price string → per-1M-tokens decimal string. */
function perTokenToPer1M(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return undefined;
  return (number * 1_000_000).toFixed(6).replace(/\.?0+$/, '') || '0';
}

async function getJson(
  url: string,
  headers: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  const response = await fetchImpl(url, {
    headers: { accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: 'error',
  });
  if (!response.ok) {
    throw Object.assign(new Error(`Model list request failed with ${response.status}`), {
      status: response.status,
    });
  }
  return response.json();
}

/**
 * Lists models from the provider's API. Endpoints follow vendor documentation and
 * should be verified; the operator can always add models manually.
 */
export async function discoverModels(
  connection: ProviderConnection,
  fetchImpl: typeof fetch = fetch,
): Promise<DiscoveredModel[]> {
  const info = PROVIDERS[connection.type];
  const base = effectiveBaseUrl(connection.type, connection.baseUrl);
  if (!base || info.discovery === 'none') throw new DiscoveryUnsupportedError();
  const bearer: Record<string, string> = connection.secret
    ? { authorization: `Bearer ${connection.secret}` }
    : {};

  switch (info.discovery) {
    case 'openai': {
      type Item = { id: string; context_length?: number; context_window?: number };
      const body = (await getJson(`${base}/models`, bearer, fetchImpl)) as
        { data?: Item[] } | Item[];
      const items = Array.isArray(body) ? body : (body.data ?? []);
      return items
        .filter((item) => typeof item.id === 'string')
        .map((item) => ({
          modelId: item.id,
          displayName: item.id,
          kind: guessKind(item.id),
          contextWindow: item.context_length ?? item.context_window,
        }));
    }
    case 'openrouter': {
      const body = (await getJson(`${base}/models`, bearer, fetchImpl)) as {
        data?: {
          id: string;
          name?: string;
          context_length?: number;
          pricing?: { prompt?: string; completion?: string };
        }[];
      };
      return (body.data ?? []).map((item) => ({
        modelId: item.id,
        displayName: item.name ?? item.id,
        kind: guessKind(item.id),
        contextWindow: item.context_length,
        costInPer1M: perTokenToPer1M(item.pricing?.prompt),
        costOutPer1M: perTokenToPer1M(item.pricing?.completion),
      }));
    }
    case 'anthropic': {
      const models: DiscoveredModel[] = [];
      let after: string | undefined;
      for (let page = 0; page < MAX_PAGES; page++) {
        const url = `${base}/models?limit=100${after ? `&after_id=${encodeURIComponent(after)}` : ''}`;
        const body = (await getJson(
          url,
          { 'x-api-key': connection.secret, 'anthropic-version': '2023-06-01' },
          fetchImpl,
        )) as {
          data?: { id: string; display_name?: string }[];
          has_more?: boolean;
          last_id?: string;
        };
        for (const item of body.data ?? []) {
          models.push({
            modelId: item.id,
            displayName: item.display_name ?? item.id,
            kind: 'CHAT',
          });
        }
        if (!body.has_more || !body.last_id) break;
        after = body.last_id;
      }
      return models;
    }
    case 'google': {
      const models: DiscoveredModel[] = [];
      let pageToken: string | undefined;
      for (let page = 0; page < MAX_PAGES; page++) {
        const url = `${base}/models?pageSize=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
        // The key goes in a header, never in the query string (which ends up in logs).
        const body = (await getJson(url, { 'x-goog-api-key': connection.secret }, fetchImpl)) as {
          models?: {
            name: string;
            displayName?: string;
            inputTokenLimit?: number;
            supportedGenerationMethods?: string[];
          }[];
          nextPageToken?: string;
        };
        for (const item of body.models ?? []) {
          const methods = item.supportedGenerationMethods ?? [];
          const kind = methods.includes('generateContent')
            ? 'CHAT'
            : methods.includes('embedContent')
              ? 'EMBEDDING'
              : undefined;
          if (!kind) continue;
          const modelId = item.name.replace(/^models\//, '');
          models.push({
            modelId,
            displayName: item.displayName ?? modelId,
            kind,
            contextWindow: item.inputTokenLimit,
          });
        }
        if (!body.nextPageToken) break;
        pageToken = body.nextPageToken;
      }
      return models;
    }
    case 'cohere': {
      const root = base.replace(/\/v\d+$/, '');
      const body = (await getJson(`${root}/v1/models`, bearer, fetchImpl)) as {
        models?: { name: string; endpoints?: string[]; context_length?: number }[];
      };
      return (body.models ?? []).map((item) => ({
        modelId: item.name,
        displayName: item.name,
        kind:
          item.endpoints?.includes('embed') && !item.endpoints.includes('chat')
            ? 'EMBEDDING'
            : 'CHAT',
        contextWindow: item.context_length,
      }));
    }
  }
  throw new DiscoveryUnsupportedError();
}
