import { randomUUID } from 'node:crypto';
import { decryptSecret, type Keyring } from '@rentagent/core';
import { getSetting, type PrismaClient } from '@rentagent/db';
import {
  dynamicTool,
  embedMany,
  generateText,
  jsonSchema,
  type JSONSchema7,
  type ModelMessage,
  streamText,
} from 'ai';
import type { Redis } from 'ioredis';
import type { ProviderTypeName } from './catalog';
import { AfterOutputError, classifyError, type ClassifiedError, type ErrorKind } from './errors';
import { createEmbeddingModel, createLanguageModel, type ProviderConnection } from './factory';
import { costMicros } from './pricing';
import { orderCandidates, runWithFallback, type Strategy } from './router';

export interface GatewayLogger {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

export interface GatewayDeps {
  db: PrismaClient;
  redis: Redis;
  keyring: Keyring;
  log: GatewayLogger;
}

/** What to call: a specific registry model, a routing policy, or the default policy. */
export type Target = { modelId: string } | { policyId: string } | { defaultPolicy: true };

export interface CallContext {
  purpose: string;
  userId?: string;
  requestId?: string;
}

export interface GenerationInput {
  system?: string;
  prompt?: string;
  messages?: ModelMessage[];
  maxOutputTokens?: number;
  temperature?: number;
  /** Per-attempt timeout. */
  timeoutMs?: number;
  /**
   * Tools the model may call. They have no executor here: tool calls are returned
   * to the caller (the agent runtime), which decides, asks for approval, and executes.
   */
  tools?: Record<string, { description: string; inputSchema: JSONSchema7 }>;
  /**
   * Receives text as it is generated (streaming). Fallback to another candidate
   * happens only before the first delta.
   */
  onTextDelta?: (delta: string) => void;
}

export interface ToolCallRequest {
  toolCallId: string;
  toolName: string;
  input: unknown;
}

export interface AttemptSummary {
  modelId: string;
  modelName: string;
  providerName: string;
  ok: boolean;
  errorKind?: ErrorKind;
}

export interface CallSummary {
  requestId: string;
  model: { id: string; modelId: string; displayName: string; providerName: string };
  usage: { inputTokens: number; outputTokens: number };
  costMicros: bigint;
  priceMicros: bigint;
  latencyMs: number;
  attempts: AttemptSummary[];
}

export class AiUnavailableError extends Error {
  constructor(readonly reason: 'disabled' | 'no_models' | 'no_keys') {
    super(`AI unavailable: ${reason}`);
    this.name = 'AiUnavailableError';
  }
}

export class GatewayCallError extends Error {
  constructor(
    readonly kind: ErrorKind,
    readonly attempts: AttemptSummary[],
  ) {
    super(`AI call failed (${kind})`);
    this.name = 'GatewayCallError';
  }
}

const COOLDOWN_SECONDS: Partial<Record<ErrorKind, number>> = {
  auth: 10 * 60,
  rate_limit: 60,
  server: 30,
};
const KEYS_PER_MODEL = 2;
const DEFAULT_TIMEOUT_MS = 120_000;

type ModelRow = Awaited<ReturnType<typeof loadModels>>[number];
type KeyRow = { id: string; secretEncrypted: string; monthlyLimitMicros: bigint | null };

interface Candidate {
  model: ModelRow;
  key: KeyRow | null;
}

function loadModels(db: PrismaClient, ids: string[]) {
  return db.aiModel.findMany({
    where: { id: { in: ids }, enabled: true, kind: 'CHAT', provider: { enabled: true } },
    include: { provider: true },
  });
}

const monthKey = (date = new Date()) =>
  `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
const spendKey = (keyId: string) => `ai:spend:${keyId}:${monthKey()}`;

async function monthlySpend(deps: GatewayDeps, keyId: string): Promise<bigint> {
  const cached = await deps.redis.get(spendKey(keyId));
  if (cached !== null) return BigInt(cached);
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const sum = await deps.db.usageRecord.aggregate({
    where: { keyId, createdAt: { gte: start } },
    _sum: { costMicros: true },
  });
  const total = sum._sum.costMicros ?? 0n;
  await deps.redis.set(spendKey(keyId), total.toString(), 'EX', 40 * 24 * 3600, 'NX');
  return total;
}

/** Usable keys for a provider in round-robin order, skipping cooled-down and over-budget keys. */
async function usableKeys(deps: GatewayDeps, providerId: string): Promise<KeyRow[]> {
  const keys = await deps.db.providerKey.findMany({
    where: { providerId, enabled: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true, secretEncrypted: true, monthlyLimitMicros: true },
  });
  if (keys.length === 0) return [];
  const offset = (await deps.redis.incr(`ai:rr:${providerId}`)) % keys.length;
  const rotated = [...keys.slice(offset), ...keys.slice(0, offset)];
  const usable: KeyRow[] = [];
  for (const key of rotated) {
    if (await deps.redis.exists(`ai:cooldown:${key.id}`)) continue;
    if (
      key.monthlyLimitMicros !== null &&
      (await monthlySpend(deps, key.id)) >= key.monthlyLimitMicros
    )
      continue;
    usable.push(key);
  }
  return usable;
}

async function resolveCandidates(deps: GatewayDeps, target: Target): Promise<Candidate[]> {
  if (await getSetting(deps.db, 'ai.disabled')) throw new AiUnavailableError('disabled');

  let ids: string[];
  let strategy: Strategy = 'FIXED';
  if ('modelId' in target) {
    ids = [target.modelId];
  } else {
    const policy =
      'policyId' in target
        ? await deps.db.routingPolicy.findUnique({ where: { id: target.policyId } })
        : await deps.db.routingPolicy.findFirst({ where: { isDefault: true } });
    if (!policy) throw new AiUnavailableError('no_models');
    ids = policy.modelIds;
    strategy = policy.strategy;
  }

  const rows = await loadModels(deps.db, ids);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const configured = ids.map((id) => byId.get(id)).filter((row): row is ModelRow => Boolean(row));
  if (configured.length === 0) throw new AiUnavailableError('no_models');

  const latencies = await Promise.all(
    configured.map((row) => deps.redis.get(`ai:latency:${row.id}`)),
  );
  const ordered = orderCandidates(
    strategy,
    configured.map((row, index) => ({
      id: row.id,
      row,
      costScore:
        row.costInPer1M !== null && row.costOutPer1M !== null
          ? Number(row.costInPer1M) + Number(row.costOutPer1M)
          : null,
      latencyMs: latencies[index] ? Number(latencies[index]) : null,
    })),
  );

  const candidates: Candidate[] = [];
  for (const { row } of ordered) {
    const keys = await usableKeys(deps, row.providerId);
    if (keys.length === 0) {
      // Local OpenAI-compatible servers often need no key at all.
      if (row.provider.type === 'OPENAI_COMPATIBLE') candidates.push({ model: row, key: null });
      continue;
    }
    for (const key of keys.slice(0, KEYS_PER_MODEL)) candidates.push({ model: row, key });
  }
  if (candidates.length === 0) throw new AiUnavailableError('no_keys');
  return candidates;
}

function connectionFor(deps: GatewayDeps, candidate: Candidate): ProviderConnection {
  const { provider } = candidate.model;
  return {
    type: provider.type as ProviderTypeName,
    baseUrl: provider.baseUrl,
    settings: (provider.settings ?? {}) as Record<string, unknown>,
    secret: candidate.key
      ? decryptSecret(
          candidate.key.secretEncrypted,
          `provider-key:${candidate.key.id}`,
          deps.keyring,
        )
      : '',
  };
}

const summarize = (candidate: Candidate, error?: ClassifiedError): AttemptSummary => ({
  modelId: candidate.model.id,
  modelName: candidate.model.displayName,
  providerName: candidate.model.provider.name,
  ok: !error,
  errorKind: error?.kind,
});

async function recordAttempt(
  deps: GatewayDeps,
  ctx: Required<Pick<CallContext, 'requestId'>> & CallContext,
  candidate: Candidate,
  attempt: number,
  outcome:
    | { ok: true; inputTokens: number; outputTokens: number; latencyMs: number }
    | { ok: false; error: ClassifiedError; latencyMs: number },
): Promise<{ cost: bigint; price: bigint }> {
  const { model, key } = candidate;
  const tokens = outcome.ok
    ? { inputTokens: outcome.inputTokens, outputTokens: outcome.outputTokens }
    : { inputTokens: 0, outputTokens: 0 };
  const cost = costMicros(tokens, {
    input: model.costInPer1M?.toString(),
    output: model.costOutPer1M?.toString(),
  });
  const price = costMicros(tokens, {
    input: model.priceInPer1M?.toString(),
    output: model.priceOutPer1M?.toString(),
  });

  try {
    await deps.db.usageRecord.create({
      data: {
        providerId: model.providerId,
        modelId: model.id,
        keyId: key?.id,
        userId: ctx.userId,
        purpose: ctx.purpose,
        requestId: ctx.requestId,
        attempt,
        status: outcome.ok ? 'SUCCESS' : 'ERROR',
        errorKind: outcome.ok ? null : outcome.error.kind,
        inputTokens: tokens.inputTokens,
        outputTokens: tokens.outputTokens,
        costMicros: cost,
        priceMicros: price,
        latencyMs: outcome.latencyMs,
      },
    });
    if (outcome.ok) {
      const latencyKey = `ai:latency:${model.id}`;
      const previous = Number((await deps.redis.get(latencyKey)) ?? outcome.latencyMs);
      await deps.redis.set(
        latencyKey,
        Math.round(previous * 0.8 + outcome.latencyMs * 0.2),
        'EX',
        7 * 24 * 3600,
      );
      if (key) {
        if (cost > 0n && (await deps.redis.exists(spendKey(key.id))))
          await deps.redis.incrby(spendKey(key.id), cost.toString());
        await deps.db.providerKey.update({
          where: { id: key.id },
          data: { lastUsedAt: new Date() },
        });
      }
    } else if (key) {
      const cooldown = COOLDOWN_SECONDS[outcome.error.kind];
      if (cooldown)
        await deps.redis.set(`ai:cooldown:${key.id}`, outcome.error.kind, 'EX', cooldown);
      await deps.db.providerKey.update({
        where: { id: key.id },
        data: { lastErrorAt: new Date(), lastErrorKind: outcome.error.kind },
      });
    }
  } catch (error) {
    // Metering must never break the user's request, but losing it is logged loudly.
    deps.log.error(
      { err: error instanceof Error ? error.message : String(error), requestId: ctx.requestId },
      'failed to record AI usage',
    );
  }
  return { cost, price };
}

function promptOf(input: GenerationInput) {
  return input.messages
    ? { system: input.system, messages: input.messages }
    : { system: input.system, prompt: input.prompt ?? '' };
}

/** Non-streaming generation with fallback and metering. */
function toolSetOf(tools: GenerationInput['tools']) {
  if (!tools || Object.keys(tools).length === 0) return undefined;
  return Object.fromEntries(
    Object.entries(tools).map(([name, tool]) => [
      name,
      dynamicTool({ description: tool.description, inputSchema: jsonSchema(tool.inputSchema) }),
    ]),
  );
}

/** The parts of a generation result the gateway uses, from either API. */
interface GenerationOutcome {
  text: string;
  toolCalls: Array<{ toolCallId: string; toolName: string; input: unknown }>;
  responseMessages: unknown[];
  finishReason: string;
  usage: { inputTokens?: number; outputTokens?: number };
}

/** One streamed attempt; errors after the first delta are not retried on another model. */
async function streamed(
  deps: GatewayDeps,
  candidate: Candidate,
  input: GenerationInput,
  onTextDelta: (delta: string) => void,
): Promise<GenerationOutcome> {
  let emitted = false;
  try {
    const result = streamText({
      model: createLanguageModel(connectionFor(deps, candidate), candidate.model.modelId),
      ...promptOf(input),
      tools: toolSetOf(input.tools),
      maxOutputTokens: input.maxOutputTokens,
      temperature: input.temperature,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(input.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') {
        emitted = true;
        onTextDelta(part.text);
      } else if (part.type === 'error') {
        throw part.error;
      }
    }
    const [text, toolCalls, responseMessages, finishReason, usage] = await Promise.all([
      result.text,
      result.toolCalls,
      result.responseMessages,
      result.finishReason,
      result.totalUsage,
    ]);
    return { text, toolCalls, responseMessages, finishReason, usage };
  } catch (error) {
    throw emitted ? new AfterOutputError(error) : error;
  }
}

export interface GenerateResult extends CallSummary {
  text: string;
  toolCalls: ToolCallRequest[];
  /** Assistant/tool messages to append to the conversation. */
  responseMessages: ModelMessage[];
  finishReason: string;
}

export async function generate(
  deps: GatewayDeps,
  target: Target,
  input: GenerationInput,
  context: CallContext,
): Promise<GenerateResult> {
  const ctx = { ...context, requestId: context.requestId ?? randomUUID() };
  const candidates = await resolveCandidates(deps, target);
  const attempts: AttemptSummary[] = [];
  try {
    const { result } = await runWithFallback(
      candidates,
      async (candidate, attempt) => {
        const started = Date.now();
        const response = input.onTextDelta
          ? await streamed(deps, candidate, input, input.onTextDelta)
          : await generateText({
              model: createLanguageModel(connectionFor(deps, candidate), candidate.model.modelId),
              ...promptOf(input),
              tools: toolSetOf(input.tools),
              maxOutputTokens: input.maxOutputTokens,
              temperature: input.temperature,
              maxRetries: 0, // retries are handled by the fallback chain
              abortSignal: AbortSignal.timeout(input.timeoutMs ?? DEFAULT_TIMEOUT_MS),
            });
        const latencyMs = Date.now() - started;
        const usage = {
          inputTokens: response.usage.inputTokens ?? 0,
          outputTokens: response.usage.outputTokens ?? 0,
        };
        const { cost, price } = await recordAttempt(deps, ctx, candidate, attempt, {
          ok: true,
          ...usage,
          latencyMs,
        });
        attempts.push(summarize(candidate));
        return {
          text: response.text,
          toolCalls: response.toolCalls.map((call) => ({
            toolCallId: call.toolCallId,
            toolName: call.toolName,
            input: call.input,
          })),
          responseMessages: response.responseMessages as ModelMessage[],
          finishReason: response.finishReason,
          usage,
          cost,
          price,
          latencyMs,
          candidate,
        };
      },
      async (candidate, error) => {
        attempts.push(summarize(candidate, error));
        await recordAttempt(deps, ctx, candidate, attempts.length, {
          ok: false,
          error,
          latencyMs: 0,
        });
        deps.log.warn(
          { requestId: ctx.requestId, model: candidate.model.modelId, kind: error.kind },
          'AI attempt failed',
        );
      },
    );
    return {
      requestId: ctx.requestId,
      text: result.text,
      toolCalls: result.toolCalls,
      responseMessages: result.responseMessages,
      finishReason: result.finishReason,
      model: {
        id: result.candidate.model.id,
        modelId: result.candidate.model.modelId,
        displayName: result.candidate.model.displayName,
        providerName: result.candidate.model.provider.name,
      },
      usage: result.usage,
      costMicros: result.cost,
      priceMicros: result.price,
      latencyMs: result.latencyMs,
      attempts,
    };
  } catch {
    throw new GatewayCallError(attempts.at(-1)?.errorKind ?? 'unknown', attempts);
  }
}

export interface StreamHandle {
  requestId: string;
  /** Text deltas. Fallback to the next candidate happens only before the first delta. */
  textStream: AsyncIterable<string>;
  /** Resolves when the stream finishes; rejects with GatewayCallError on failure. */
  done: Promise<CallSummary>;
}

/** Streaming generation with pre-first-token fallback and metering. */
export async function stream(
  deps: GatewayDeps,
  target: Target,
  input: GenerationInput,
  context: CallContext,
): Promise<StreamHandle> {
  const ctx = { ...context, requestId: context.requestId ?? randomUUID() };
  const candidates = await resolveCandidates(deps, target);
  const attempts: AttemptSummary[] = [];
  let resolveDone!: (summary: CallSummary) => void;
  let rejectDone!: (error: unknown) => void;
  const done = new Promise<CallSummary>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });
  done.catch(() => undefined); // the consumer may only read textStream

  async function* textStream(): AsyncGenerator<string> {
    for (const [index, candidate] of candidates.entries()) {
      const attempt = index + 1;
      const started = Date.now();
      const cancel = new AbortController();
      let emitted = false;
      let settled = false;
      try {
        const result = streamText({
          model: createLanguageModel(connectionFor(deps, candidate), candidate.model.modelId),
          ...promptOf(input),
          maxOutputTokens: input.maxOutputTokens,
          temperature: input.temperature,
          maxRetries: 0,
          abortSignal: AbortSignal.any([
            cancel.signal,
            AbortSignal.timeout(input.timeoutMs ?? DEFAULT_TIMEOUT_MS),
          ]),
        });
        let usage = { inputTokens: 0, outputTokens: 0 };
        for await (const part of result.fullStream) {
          if (part.type === 'text-delta') {
            emitted = true;
            yield part.text;
          } else if (part.type === 'error') {
            throw part.error;
          } else if (part.type === 'finish') {
            usage = {
              inputTokens: part.totalUsage.inputTokens ?? 0,
              outputTokens: part.totalUsage.outputTokens ?? 0,
            };
          }
        }
        settled = true;
        const latencyMs = Date.now() - started;
        const { cost, price } = await recordAttempt(deps, ctx, candidate, attempt, {
          ok: true,
          ...usage,
          latencyMs,
        });
        attempts.push(summarize(candidate));
        resolveDone({
          requestId: ctx.requestId,
          model: {
            id: candidate.model.id,
            modelId: candidate.model.modelId,
            displayName: candidate.model.displayName,
            providerName: candidate.model.provider.name,
          },
          usage,
          costMicros: cost,
          priceMicros: price,
          latencyMs,
          attempts,
        });
        return;
      } catch (raw) {
        settled = true;
        const error = classifyError(raw);
        attempts.push(summarize(candidate, error));
        await recordAttempt(deps, ctx, candidate, attempt, {
          ok: false,
          error,
          latencyMs: Date.now() - started,
        });
        deps.log.warn(
          { requestId: ctx.requestId, model: candidate.model.modelId, kind: error.kind },
          'AI stream attempt failed',
        );
        // After text reached the client, switching models would produce a mixed answer.
        if (emitted || !error.fallback) {
          const failure = new GatewayCallError(error.kind, attempts);
          rejectDone(failure);
          throw failure;
        }
      } finally {
        // The consumer stopped reading (e.g. client disconnected): stop paying for tokens.
        if (!settled) {
          cancel.abort();
          const error: ClassifiedError = { kind: 'cancelled', fallback: false };
          attempts.push(summarize(candidate, error));
          await recordAttempt(deps, ctx, candidate, attempt, {
            ok: false,
            error,
            latencyMs: Date.now() - started,
          });
          rejectDone(new GatewayCallError('cancelled', attempts));
        }
      }
    }
    const failure = new GatewayCallError(attempts.at(-1)?.errorKind ?? 'unknown', attempts);
    rejectDone(failure);
    throw failure;
  }

  return { requestId: ctx.requestId, textStream: textStream(), done };
}

/**
 * Embeds texts with a registry embedding model, rotating across the provider's
 * keys on transient errors. Usage is metered like any other call.
 */
export async function embedTexts(
  deps: GatewayDeps,
  modelRowId: string,
  values: string[],
  context: CallContext,
): Promise<{ embeddings: number[][]; costMicros: bigint }> {
  if (await getSetting(deps.db, 'ai.disabled')) throw new AiUnavailableError('disabled');
  const model = await deps.db.aiModel.findFirst({
    where: { id: modelRowId, enabled: true, kind: 'EMBEDDING', provider: { enabled: true } },
    include: { provider: true },
  });
  if (!model) throw new AiUnavailableError('no_models');
  const keys = await usableKeys(deps, model.providerId);
  const candidates: Candidate[] =
    keys.length > 0
      ? keys.map((key) => ({ model: model as ModelRow, key }))
      : model.provider.type === 'OPENAI_COMPATIBLE'
        ? [{ model: model as ModelRow, key: null }]
        : [];
  if (candidates.length === 0) throw new AiUnavailableError('no_keys');

  const ctx = { ...context, requestId: context.requestId ?? randomUUID() };
  let attemptNo = 0;
  try {
    const { result } = await runWithFallback(
      candidates,
      async (candidate) => {
        attemptNo++;
        const started = Date.now();
        const response = await embedMany({
          model: createEmbeddingModel(connectionFor(deps, candidate), candidate.model.modelId),
          values,
          maxRetries: 0,
          abortSignal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
        });
        const { cost } = await recordAttempt(deps, ctx, candidate, attemptNo, {
          ok: true,
          inputTokens: response.usage.tokens ?? 0,
          outputTokens: 0,
          latencyMs: Date.now() - started,
        });
        return { embeddings: response.embeddings, costMicros: cost };
      },
      async (candidate, error) => {
        await recordAttempt(deps, ctx, candidate, attemptNo, { ok: false, error, latencyMs: 0 });
      },
    );
    return result;
  } catch (error) {
    throw new GatewayCallError(
      classifyError((error as { cause?: unknown }).cause ?? error).kind,
      [],
    );
  }
}
