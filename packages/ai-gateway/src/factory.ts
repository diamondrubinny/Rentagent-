import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createAzure } from '@ai-sdk/azure';
import { createCohere } from '@ai-sdk/cohere';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createFireworks } from '@ai-sdk/fireworks';
import { createGoogle } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { createMistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createPerplexity } from '@ai-sdk/perplexity';
import { createTogetherAI } from '@ai-sdk/togetherai';
import { createXai } from '@ai-sdk/xai';
import type { EmbeddingModel, LanguageModel } from 'ai';
import type { ProviderTypeName } from './catalog';

export interface ProviderConnection {
  type: ProviderTypeName;
  /** Operator override; vendor default is used when empty. */
  baseUrl?: string | null;
  settings: Record<string, unknown>;
  /** Decrypted credential: an API key, or JSON for AWS key pairs. Empty for keyless local servers. */
  secret: string;
}

export interface AwsKeyPair {
  accessKeyId: string;
  secretAccessKey: string;
}

export function parseAwsKeyPair(secret: string): AwsKeyPair {
  const parsed = JSON.parse(secret) as Partial<AwsKeyPair>;
  if (!parsed.accessKeyId || !parsed.secretAccessKey) throw new Error('Invalid AWS key pair');
  return { accessKeyId: parsed.accessKeyId, secretAccessKey: parsed.secretAccessKey };
}

const setting = (settings: Record<string, unknown>, key: string) =>
  typeof settings[key] === 'string' && settings[key] ? (settings[key] as string) : undefined;

interface ProviderInstance {
  languageModel(modelId: string): LanguageModel;
  embeddingModel?(modelId: string): EmbeddingModel;
}

/** Creates an AI SDK provider instance for a configured connection (no network calls). */
export function createProviderInstance(connection: ProviderConnection): ProviderInstance {
  const baseURL = connection.baseUrl?.trim() || undefined;
  const apiKey = connection.secret;
  switch (connection.type) {
    case 'OPENAI':
      return createOpenAI({ apiKey, baseURL });
    case 'ANTHROPIC':
      return createAnthropic({ apiKey, baseURL });
    case 'GOOGLE':
      return createGoogle({ apiKey, baseURL });
    case 'MISTRAL':
      return createMistral({ apiKey, baseURL });
    case 'XAI':
      return createXai({ apiKey, baseURL });
    case 'DEEPSEEK':
      return createDeepSeek({ apiKey, baseURL });
    case 'GROQ':
      return createGroq({ apiKey, baseURL });
    case 'TOGETHER':
      return createTogetherAI({ apiKey, baseURL });
    case 'FIREWORKS':
      return createFireworks({ apiKey, baseURL });
    case 'PERPLEXITY':
      return createPerplexity({ apiKey, baseURL });
    case 'COHERE':
      return createCohere({ apiKey, baseURL });
    case 'AZURE_OPENAI':
      return createAzure({
        apiKey,
        baseURL,
        resourceName: baseURL ? undefined : setting(connection.settings, 'azureResourceName'),
        apiVersion: setting(connection.settings, 'azureApiVersion'),
      });
    case 'AMAZON_BEDROCK': {
      const pair = parseAwsKeyPair(connection.secret);
      return createAmazonBedrock({
        region: setting(connection.settings, 'awsRegion') ?? 'us-east-1',
        accessKeyId: pair.accessKeyId,
        secretAccessKey: pair.secretAccessKey,
        baseURL,
      });
    }
    case 'OPENROUTER':
      return createOpenAICompatible({
        name: 'openrouter',
        baseURL: baseURL ?? 'https://openrouter.ai/api/v1',
        apiKey,
        includeUsage: true,
      });
    case 'OPENAI_COMPATIBLE':
      if (!baseURL) throw new Error('OPENAI_COMPATIBLE providers require a base URL');
      return createOpenAICompatible({
        name: 'openai-compatible',
        baseURL,
        apiKey: apiKey || undefined,
        includeUsage: true,
      });
  }
}

export function createLanguageModel(
  connection: ProviderConnection,
  modelId: string,
): LanguageModel {
  return createProviderInstance(connection).languageModel(modelId);
}

export function createEmbeddingModel(
  connection: ProviderConnection,
  modelId: string,
): EmbeddingModel {
  const instance = createProviderInstance(connection);
  if (!instance.embeddingModel) throw new Error(`${connection.type} does not support embeddings`);
  return instance.embeddingModel(modelId);
}
