import { generateText } from 'ai';
import { createLanguageModel, type ProviderConnection } from './factory';

/** Minimal generation used to verify a credential when the provider has no model-list endpoint. */
export async function probeGeneration(
  connection: ProviderConnection,
  modelId: string,
): Promise<void> {
  await generateText({
    model: createLanguageModel(connection, modelId),
    prompt: 'Reply with the single word: OK',
    maxOutputTokens: 5,
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(30_000),
  });
}
