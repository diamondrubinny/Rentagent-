/**
 * Static metadata for supported provider types. Default endpoints and model-list
 * support reflect vendor documentation at the time of writing and must be verified
 * against the official docs before production use.
 */
export const PROVIDER_TYPES = [
  'OPENAI',
  'ANTHROPIC',
  'GOOGLE',
  'MISTRAL',
  'XAI',
  'DEEPSEEK',
  'GROQ',
  'TOGETHER',
  'FIREWORKS',
  'PERPLEXITY',
  'COHERE',
  'OPENROUTER',
  'AZURE_OPENAI',
  'AMAZON_BEDROCK',
  'OPENAI_COMPATIBLE',
] as const;
export type ProviderTypeName = (typeof PROVIDER_TYPES)[number];

/** How a provider's model list is discovered, if at all. */
export type DiscoveryKind = 'openai' | 'anthropic' | 'google' | 'cohere' | 'openrouter' | 'none';

export type SettingField = 'azureResourceName' | 'azureApiVersion' | 'awsRegion';

export interface ProviderInfo {
  type: ProviderTypeName;
  label: string;
  /** Vendor default API base URL (used for discovery and when no override is set). */
  defaultBaseUrl?: string;
  baseUrlRequired: boolean;
  /** Bedrock uses an access key pair instead of a single API key. */
  credential: 'apiKey' | 'awsKeyPair' | 'optionalApiKey';
  settings: SettingField[];
  discovery: DiscoveryKind;
  supportsEmbeddings: boolean;
  docsUrl: string;
}

export const PROVIDERS: Readonly<Record<ProviderTypeName, ProviderInfo>> = {
  OPENAI: {
    type: 'OPENAI',
    label: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    baseUrlRequired: false,
    credential: 'apiKey',
    settings: [],
    discovery: 'openai',
    supportsEmbeddings: true,
    docsUrl: 'https://platform.openai.com/docs',
  },
  ANTHROPIC: {
    type: 'ANTHROPIC',
    label: 'Anthropic',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    baseUrlRequired: false,
    credential: 'apiKey',
    settings: [],
    discovery: 'anthropic',
    supportsEmbeddings: false,
    docsUrl: 'https://docs.anthropic.com',
  },
  GOOGLE: {
    type: 'GOOGLE',
    label: 'Google Gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    baseUrlRequired: false,
    credential: 'apiKey',
    settings: [],
    discovery: 'google',
    supportsEmbeddings: true,
    docsUrl: 'https://ai.google.dev/gemini-api/docs',
  },
  MISTRAL: {
    type: 'MISTRAL',
    label: 'Mistral AI',
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    baseUrlRequired: false,
    credential: 'apiKey',
    settings: [],
    discovery: 'openai',
    supportsEmbeddings: true,
    docsUrl: 'https://docs.mistral.ai',
  },
  XAI: {
    type: 'XAI',
    label: 'xAI (Grok)',
    defaultBaseUrl: 'https://api.x.ai/v1',
    baseUrlRequired: false,
    credential: 'apiKey',
    settings: [],
    discovery: 'openai',
    supportsEmbeddings: false,
    docsUrl: 'https://docs.x.ai',
  },
  DEEPSEEK: {
    type: 'DEEPSEEK',
    label: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com',
    baseUrlRequired: false,
    credential: 'apiKey',
    settings: [],
    discovery: 'openai',
    supportsEmbeddings: false,
    docsUrl: 'https://api-docs.deepseek.com',
  },
  GROQ: {
    type: 'GROQ',
    label: 'Groq',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    baseUrlRequired: false,
    credential: 'apiKey',
    settings: [],
    discovery: 'openai',
    supportsEmbeddings: false,
    docsUrl: 'https://console.groq.com/docs',
  },
  TOGETHER: {
    type: 'TOGETHER',
    label: 'Together AI',
    defaultBaseUrl: 'https://api.together.xyz/v1',
    baseUrlRequired: false,
    credential: 'apiKey',
    settings: [],
    discovery: 'openai',
    supportsEmbeddings: true,
    docsUrl: 'https://docs.together.ai',
  },
  FIREWORKS: {
    type: 'FIREWORKS',
    label: 'Fireworks AI',
    defaultBaseUrl: 'https://api.fireworks.ai/inference/v1',
    baseUrlRequired: false,
    credential: 'apiKey',
    settings: [],
    discovery: 'openai',
    supportsEmbeddings: true,
    docsUrl: 'https://docs.fireworks.ai',
  },
  PERPLEXITY: {
    type: 'PERPLEXITY',
    label: 'Perplexity',
    defaultBaseUrl: 'https://api.perplexity.ai',
    baseUrlRequired: false,
    credential: 'apiKey',
    settings: [],
    discovery: 'none',
    supportsEmbeddings: false,
    docsUrl: 'https://docs.perplexity.ai',
  },
  COHERE: {
    type: 'COHERE',
    label: 'Cohere',
    defaultBaseUrl: 'https://api.cohere.com/v2',
    baseUrlRequired: false,
    credential: 'apiKey',
    settings: [],
    discovery: 'cohere',
    supportsEmbeddings: true,
    docsUrl: 'https://docs.cohere.com',
  },
  OPENROUTER: {
    type: 'OPENROUTER',
    label: 'OpenRouter',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    baseUrlRequired: false,
    credential: 'apiKey',
    settings: [],
    discovery: 'openrouter',
    supportsEmbeddings: false,
    docsUrl: 'https://openrouter.ai/docs',
  },
  AZURE_OPENAI: {
    type: 'AZURE_OPENAI',
    label: 'Azure OpenAI',
    baseUrlRequired: false,
    credential: 'apiKey',
    settings: ['azureResourceName', 'azureApiVersion'],
    discovery: 'none',
    supportsEmbeddings: true,
    docsUrl: 'https://learn.microsoft.com/azure/ai-services/openai/',
  },
  AMAZON_BEDROCK: {
    type: 'AMAZON_BEDROCK',
    label: 'Amazon Bedrock',
    baseUrlRequired: false,
    credential: 'awsKeyPair',
    settings: ['awsRegion'],
    discovery: 'none',
    supportsEmbeddings: true,
    docsUrl: 'https://docs.aws.amazon.com/bedrock/',
  },
  OPENAI_COMPATIBLE: {
    type: 'OPENAI_COMPATIBLE',
    label: 'OpenAI-compatible (Ollama, vLLM, LM Studio, other)',
    baseUrlRequired: true,
    credential: 'optionalApiKey',
    settings: [],
    discovery: 'openai',
    supportsEmbeddings: true,
    docsUrl: 'https://platform.openai.com/docs/api-reference',
  },
};

export function isProviderType(value: unknown): value is ProviderTypeName {
  return typeof value === 'string' && (PROVIDER_TYPES as readonly string[]).includes(value);
}

/** Effective API base URL (operator override wins). */
export function effectiveBaseUrl(
  type: ProviderTypeName,
  override?: string | null,
): string | undefined {
  return (override?.trim() || PROVIDERS[type].defaultBaseUrl)?.replace(/\/+$/, '');
}

export interface ModelCapabilities {
  tools: boolean;
  vision: boolean;
  json: boolean;
  reasoning: boolean;
}

export const CAPABILITY_KEYS = ['tools', 'vision', 'json', 'reasoning'] as const;

export function parseCapabilities(value: unknown): ModelCapabilities {
  const source = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    tools: source.tools === true,
    vision: source.vision === true,
    json: source.json === true,
    reasoning: source.reasoning === true,
  };
}
