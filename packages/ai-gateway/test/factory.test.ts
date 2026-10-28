import { describe, expect, it } from 'vitest';
import { PROVIDER_TYPES, PROVIDERS } from '../src/catalog';
import { createLanguageModel } from '../src/factory';

describe('createLanguageModel', () => {
  it.each(PROVIDER_TYPES)('builds a model for %s without network calls', (type) => {
    const secret =
      type === 'AMAZON_BEDROCK'
        ? JSON.stringify({ accessKeyId: 'AKIA', secretAccessKey: 's' })
        : 'key';
    const model = createLanguageModel(
      {
        type,
        baseUrl: PROVIDERS[type].baseUrlRequired ? 'http://localhost:11434/v1' : undefined,
        settings: { azureResourceName: 'res', awsRegion: 'eu-west-1' },
        secret,
      },
      'some-model',
    );
    expect(
      typeof model === 'object' && model !== null && 'modelId' in model ? model.modelId : model,
    ).toBe('some-model');
  });

  it('requires a base URL for OpenAI-compatible servers', () => {
    expect(() =>
      createLanguageModel({ type: 'OPENAI_COMPATIBLE', settings: {}, secret: '' }, 'm'),
    ).toThrow();
  });

  it('rejects malformed AWS credentials', () => {
    expect(() =>
      createLanguageModel({ type: 'AMAZON_BEDROCK', settings: {}, secret: '{}' }, 'm'),
    ).toThrow();
  });
});
