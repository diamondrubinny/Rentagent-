import { describe, expect, it, vi } from 'vitest';
import { discoverModels, DiscoveryUnsupportedError } from '../src/discovery';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('discoverModels', () => {
  it('lists OpenAI-style models with bearer auth', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse({ data: [{ id: 'chat-1' }, { id: 'text-embedding-x' }] }),
    );
    const models = await discoverModels(
      { type: 'OPENAI', settings: {}, secret: 'sk-test' },
      fetchMock,
    );
    expect(models.map((m) => [m.modelId, m.kind])).toEqual([
      ['chat-1', 'CHAT'],
      ['text-embedding-x', 'EMBEDDING'],
    ]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/models');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-test');
  });

  it('accepts array responses and custom base URLs', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse([{ id: 'llama', context_length: 8192 }]),
    );
    const models = await discoverModels(
      { type: 'OPENAI_COMPATIBLE', baseUrl: 'http://ollama:11434/v1/', settings: {}, secret: '' },
      fetchMock,
    );
    expect(models[0]).toMatchObject({ modelId: 'llama', contextWindow: 8192 });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://ollama:11434/v1/models');
  });

  it('paginates Anthropic with its headers', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ data: [{ id: 'a', display_name: 'A' }], has_more: true, last_id: 'a' }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'b' }], has_more: false }));
    const models = await discoverModels(
      { type: 'ANTHROPIC', settings: {}, secret: 'k' },
      fetchMock,
    );
    expect(models.map((m) => m.displayName)).toEqual(['A', 'b']);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('k');
    expect(fetchMock.mock.calls[1]?.[0]).toContain('after_id=a');
  });

  it('maps Google models, keeps the key out of the URL', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        models: [
          {
            name: 'models/g-chat',
            displayName: 'G',
            inputTokenLimit: 1000,
            supportedGenerationMethods: ['generateContent'],
          },
          { name: 'models/g-embed', supportedGenerationMethods: ['embedContent'] },
          { name: 'models/other', supportedGenerationMethods: ['somethingElse'] },
        ],
      }),
    );
    const models = await discoverModels(
      { type: 'GOOGLE', settings: {}, secret: 'secret-key' },
      fetchMock,
    );
    expect(models.map((m) => [m.modelId, m.kind])).toEqual([
      ['g-chat', 'CHAT'],
      ['g-embed', 'EMBEDDING'],
    ]);
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain('secret-key');
  });

  it('converts OpenRouter per-token prices to per-1M', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        data: [
          {
            id: 'x/y',
            name: 'Y',
            context_length: 1,
            pricing: { prompt: '0.000003', completion: '0.000015' },
          },
        ],
      }),
    );
    const [model] = await discoverModels(
      { type: 'OPENROUTER', settings: {}, secret: 'k' },
      fetchMock,
    );
    expect(model).toMatchObject({ costInPer1M: '3', costOutPer1M: '15' });
  });

  it('surfaces HTTP errors with their status', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({}, 401));
    await expect(
      discoverModels({ type: 'MISTRAL', settings: {}, secret: 'bad' }, fetchMock),
    ).rejects.toMatchObject({
      status: 401,
    });
  });

  it('reports unsupported providers', async () => {
    await expect(
      discoverModels({ type: 'AMAZON_BEDROCK', settings: {}, secret: '{}' }),
    ).rejects.toBeInstanceOf(DiscoveryUnsupportedError);
  });
});
