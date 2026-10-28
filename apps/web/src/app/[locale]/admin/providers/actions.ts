'use server';

import { randomUUID } from 'node:crypto';
import {
  checkEndpointUrl,
  classifyError,
  discoverModels,
  DiscoveryUnsupportedError,
  isProviderType,
  probeGeneration,
  PROVIDERS,
  type ProviderConnection,
  type ProviderTypeName,
} from '@rentagent/ai-gateway';
import { decryptSecret, encryptSecret } from '@rentagent/core';
import { Prisma, settingUpsert } from '@rentagent/db';
import { decimalPriceField, modelFormSchema, normalizeSingleLine } from '@rentagent/shared';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { authorizeAction } from '@/lib/server/admin-action';
import { audit } from '@/lib/server/audit';
import { db, encryptionKeyring, redis } from '@/lib/server/runtime';

export type FormResult =
  | { ok: true; id?: string; message?: string; values?: Record<string, number> }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const idSchema = z.uuid();
const nameSchema = z
  .string()
  .transform(normalizeSingleLine)
  .pipe(z.string().min(1, { error: 'required' }).max(80, { error: 'tooLong' }));
const settingValue = z
  .string()
  .transform(normalizeSingleLine)
  .pipe(
    z
      .string()
      .max(120, { error: 'tooLong' })
      .regex(/^[\w.:-]*$/, { error: 'invalidValue' }),
  );

function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) errors[String(issue.path[0] ?? 'form')] ??= issue.message;
  return errors;
}

const forbidden = { ok: false, error: 'forbidden' } as const;
const refresh = () => revalidatePath('/[locale]/admin', 'layout');

async function validateBaseUrl(
  type: ProviderTypeName,
  baseUrl: string,
): Promise<string | null | FormResult> {
  if (!baseUrl) {
    return PROVIDERS[type].baseUrlRequired
      ? { ok: false, error: 'invalid', fieldErrors: { baseUrl: 'required' } }
      : null;
  }
  const check = await checkEndpointUrl(baseUrl);
  if (!check.ok)
    return { ok: false, error: 'invalid', fieldErrors: { baseUrl: `url_${check.reason}` } };
  return check.url;
}

const providerSchema = z.object({
  name: nameSchema,
  baseUrl: z.string().trim().max(500, { error: 'tooLong' }),
  azureResourceName: settingValue.optional(),
  azureApiVersion: settingValue.optional(),
  awsRegion: settingValue.optional(),
});

function settingsFor(type: ProviderTypeName, data: z.infer<typeof providerSchema>) {
  const settings: Record<string, string> = {};
  for (const field of PROVIDERS[type].settings) {
    const value = data[field];
    if (value) settings[field] = value;
  }
  return settings;
}

export async function createProvider(
  type: string,
  input: Record<string, string>,
): Promise<FormResult> {
  const actor = await authorizeAction('providers.manage');
  if (!actor) return forbidden;
  if (!isProviderType(type)) return { ok: false, error: 'invalid' };
  const parsed = providerSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: 'invalid', fieldErrors: fieldErrorsOf(parsed.error) };
  const baseUrl = await validateBaseUrl(type, parsed.data.baseUrl);
  if (baseUrl !== null && typeof baseUrl === 'object') return baseUrl;

  const provider = await db().provider.create({
    data: { type, name: parsed.data.name, baseUrl, settings: settingsFor(type, parsed.data) },
  });
  await audit('ai.provider_created', {
    actorId: actor.id,
    target: `provider:${provider.id}`,
    meta: { type },
  });
  refresh();
  return { ok: true, id: provider.id };
}

export async function updateProvider(
  id: string,
  input: Record<string, string>,
  enabled: boolean,
): Promise<FormResult> {
  const actor = await authorizeAction('providers.manage');
  if (!actor) return forbidden;
  if (!idSchema.safeParse(id).success) return { ok: false, error: 'invalid' };
  const existing = await db().provider.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: 'notFound' };
  const type = existing.type as ProviderTypeName;
  const parsed = providerSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: 'invalid', fieldErrors: fieldErrorsOf(parsed.error) };
  const baseUrl = await validateBaseUrl(type, parsed.data.baseUrl);
  if (baseUrl !== null && typeof baseUrl === 'object') return baseUrl;

  await db().provider.update({
    where: { id },
    data: { name: parsed.data.name, baseUrl, settings: settingsFor(type, parsed.data), enabled },
  });
  await audit('ai.provider_updated', {
    actorId: actor.id,
    target: `provider:${id}`,
    meta: { enabled, baseUrlChanged: baseUrl !== existing.baseUrl },
  });
  refresh();
  return { ok: true };
}

export async function deleteProvider(id: string): Promise<FormResult> {
  const actor = await authorizeAction('providers.manage');
  if (!actor) return forbidden;
  if (!idSchema.safeParse(id).success) return { ok: false, error: 'invalid' };
  const { count } = await db().provider.deleteMany({ where: { id } });
  if (count === 0) return { ok: false, error: 'notFound' };
  await audit('ai.provider_deleted', { actorId: actor.id, target: `provider:${id}` });
  refresh();
  return { ok: true };
}

const keySchema = z.object({
  label: nameSchema,
  apiKey: z.string().trim().max(4096, { error: 'tooLong' }),
  awsAccessKeyId: z.string().trim().max(128, { error: 'tooLong' }),
  awsSecretAccessKey: z.string().trim().max(256, { error: 'tooLong' }),
  monthlyLimit: decimalPriceField,
});

const usdToMicros = (value: string | null) => {
  if (value === null) return null;
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(whole + fraction.padEnd(6, '0').slice(0, 6));
};

export async function addKey(
  providerId: string,
  input: Record<string, string>,
): Promise<FormResult> {
  const actor = await authorizeAction('providers.manage');
  if (!actor) return forbidden;
  if (!idSchema.safeParse(providerId).success) return { ok: false, error: 'invalid' };
  const provider = await db().provider.findUnique({ where: { id: providerId } });
  if (!provider) return { ok: false, error: 'notFound' };
  const parsed = keySchema.safeParse({
    awsAccessKeyId: '',
    awsSecretAccessKey: '',
    apiKey: '',
    ...input,
  });
  if (!parsed.success)
    return { ok: false, error: 'invalid', fieldErrors: fieldErrorsOf(parsed.error) };
  const data = parsed.data;

  const credential = PROVIDERS[provider.type as ProviderTypeName].credential;
  let secret: string;
  let last4: string;
  if (credential === 'awsKeyPair') {
    if (!data.awsAccessKeyId || !data.awsSecretAccessKey) {
      return { ok: false, error: 'invalid', fieldErrors: { awsAccessKeyId: 'required' } };
    }
    secret = JSON.stringify({
      accessKeyId: data.awsAccessKeyId,
      secretAccessKey: data.awsSecretAccessKey,
    });
    last4 = data.awsAccessKeyId.slice(-4);
  } else {
    if (!data.apiKey && credential === 'apiKey') {
      return { ok: false, error: 'invalid', fieldErrors: { apiKey: 'required' } };
    }
    secret = data.apiKey;
    last4 = data.apiKey ? data.apiKey.slice(-4) : '';
  }

  // The id is generated first so the ciphertext can be bound to it (cannot be moved to another row).
  const id = randomUUID();
  await db().providerKey.create({
    data: {
      id,
      providerId,
      label: data.label,
      secretEncrypted: encryptSecret(secret, `provider-key:${id}`, encryptionKeyring()),
      last4,
      monthlyLimitMicros: usdToMicros(data.monthlyLimit),
    },
  });
  await audit('ai.key_added', {
    actorId: actor.id,
    target: `provider-key:${id}`,
    meta: { providerId },
  });
  refresh();
  return { ok: true, id };
}

export async function updateKey(
  keyId: string,
  input: { label: string; monthlyLimit: string; enabled: boolean },
): Promise<FormResult> {
  const actor = await authorizeAction('providers.manage');
  if (!actor) return forbidden;
  if (!idSchema.safeParse(keyId).success) return { ok: false, error: 'invalid' };
  const parsed = z.object({ label: nameSchema, monthlyLimit: decimalPriceField }).safeParse(input);
  if (!parsed.success)
    return { ok: false, error: 'invalid', fieldErrors: fieldErrorsOf(parsed.error) };
  const { count } = await db().providerKey.updateMany({
    where: { id: keyId },
    data: {
      label: parsed.data.label,
      monthlyLimitMicros: usdToMicros(parsed.data.monthlyLimit),
      enabled: input.enabled,
      ...(input.enabled ? { lastErrorKind: null } : {}),
    },
  });
  if (count === 0) return { ok: false, error: 'notFound' };
  if (input.enabled) await redis().del(`ai:cooldown:${keyId}`);
  await audit('ai.key_updated', {
    actorId: actor.id,
    target: `provider-key:${keyId}`,
    meta: { enabled: input.enabled },
  });
  refresh();
  return { ok: true };
}

export async function deleteKey(keyId: string): Promise<FormResult> {
  const actor = await authorizeAction('providers.manage');
  if (!actor) return forbidden;
  if (!idSchema.safeParse(keyId).success) return { ok: false, error: 'invalid' };
  const { count } = await db().providerKey.deleteMany({ where: { id: keyId } });
  if (count === 0) return { ok: false, error: 'notFound' };
  await audit('ai.key_deleted', { actorId: actor.id, target: `provider-key:${keyId}` });
  refresh();
  return { ok: true };
}

async function connectionForKey(keyId: string) {
  const key = await db().providerKey.findUnique({
    where: { id: keyId },
    include: { provider: true },
  });
  if (!key) return null;
  const connection: ProviderConnection = {
    type: key.provider.type as ProviderTypeName,
    baseUrl: key.provider.baseUrl,
    settings: (key.provider.settings ?? {}) as Record<string, unknown>,
    secret: decryptSecret(key.secretEncrypted, `provider-key:${key.id}`, encryptionKeyring()),
  };
  return { key, connection };
}

/**
 * Verifies a key: lists models when the provider supports it, otherwise sends a
 * tiny generation to the first enabled chat model. Only the error kind is returned.
 */
export async function testKey(keyId: string): Promise<FormResult> {
  const actor = await authorizeAction('providers.manage');
  if (!actor) return forbidden;
  if (!idSchema.safeParse(keyId).success) return { ok: false, error: 'invalid' };
  const loaded = await connectionForKey(keyId);
  if (!loaded) return { ok: false, error: 'notFound' };
  const { key, connection } = loaded;

  let result: FormResult;
  try {
    try {
      const models = await discoverModels(connection);
      result = { ok: true, message: 'testListed', values: { count: models.length } };
    } catch (error) {
      if (!(error instanceof DiscoveryUnsupportedError)) throw error;
      const model = await db().aiModel.findFirst({
        where: { providerId: key.providerId, enabled: true, kind: 'CHAT' },
        orderBy: { createdAt: 'asc' },
      });
      if (!model) return { ok: false, error: 'testNeedsModel' };
      await probeGeneration(connection, model.modelId);
      result = { ok: true, message: 'testGenerated' };
    }
  } catch (error) {
    const status = (error as { status?: number }).status;
    const kind =
      status === 401 || status === 403
        ? 'auth'
        : status === 429
          ? 'rate_limit'
          : classifyError(error).kind;
    result = { ok: false, error: `ai_${kind}` };
  }

  await db().providerKey.update({
    where: { id: keyId },
    data: result.ok
      ? { lastErrorKind: null }
      : { lastErrorAt: new Date(), lastErrorKind: result.error.slice(3) },
  });
  if (result.ok) await redis().del(`ai:cooldown:${keyId}`);
  await audit('ai.key_tested', {
    actorId: actor.id,
    target: `provider-key:${keyId}`,
    meta: { ok: result.ok },
  });
  refresh();
  return result;
}

/** Imports models from the provider API. Existing entries (and operator edits) are never overwritten. */
export async function importModels(providerId: string): Promise<FormResult> {
  const actor = await authorizeAction('providers.manage');
  if (!actor) return forbidden;
  if (!idSchema.safeParse(providerId).success) return { ok: false, error: 'invalid' };
  const provider = await db().provider.findUnique({ where: { id: providerId } });
  if (!provider) return { ok: false, error: 'notFound' };
  const type = provider.type as ProviderTypeName;
  const keys = await db().providerKey.findMany({
    where: { providerId, enabled: true },
    orderBy: { createdAt: 'asc' },
  });
  if (keys.length === 0 && PROVIDERS[type].credential !== 'optionalApiKey') {
    return { ok: false, error: 'needsKey' };
  }

  const connectionWith = (secret: string): ProviderConnection => ({
    type,
    baseUrl: provider.baseUrl,
    settings: (provider.settings ?? {}) as Record<string, unknown>,
    secret,
  });
  const secrets = keys.length
    ? keys.map((key) =>
        decryptSecret(key.secretEncrypted, `provider-key:${key.id}`, encryptionKeyring()),
      )
    : [''];

  // Try each enabled key: one rate-limited or revoked key must not block the import.
  let discovered;
  let lastError = 'ai_unknown';
  for (const secret of secrets) {
    try {
      discovered = await discoverModels(connectionWith(secret));
      break;
    } catch (error) {
      if (error instanceof DiscoveryUnsupportedError)
        return { ok: false, error: 'discoveryUnsupported' };
      const status = (error as { status?: number }).status;
      lastError =
        status === 401 || status === 403
          ? 'ai_auth'
          : status === 429
            ? 'ai_rate_limit'
            : `ai_${classifyError(error).kind}`;
    }
  }
  if (!discovered) return { ok: false, error: lastError };

  const existing = new Set(
    (await db().aiModel.findMany({ where: { providerId }, select: { modelId: true } })).map(
      (model) => model.modelId,
    ),
  );
  const fresh = discovered.filter((model) => !existing.has(model.modelId)).slice(0, 2000);
  if (fresh.length > 0) {
    await db().aiModel.createMany({
      data: fresh.map((model) => ({
        providerId,
        modelId: model.modelId.slice(0, 200),
        displayName: model.displayName.slice(0, 120),
        kind: model.kind,
        contextWindow:
          model.contextWindow && model.contextWindow < 2_000_000_000 ? model.contextWindow : null,
        costInPer1M: model.costInPer1M ? new Prisma.Decimal(model.costInPer1M) : null,
        costOutPer1M: model.costOutPer1M ? new Prisma.Decimal(model.costOutPer1M) : null,
        // Imported models start hidden: the operator reviews capabilities and prices first.
        visible: false,
        enabled: false,
      })),
      skipDuplicates: true,
    });
  }
  await audit('ai.models_imported', {
    actorId: actor.id,
    target: `provider:${providerId}`,
    meta: { added: fresh.length, found: discovered.length },
  });
  refresh();
  return {
    ok: true,
    message: 'imported',
    values: { added: fresh.length, found: discovered.length },
  };
}

function decimalOrNull(value: string | null) {
  return value === null ? null : new Prisma.Decimal(value);
}

export async function saveModel(
  providerId: string,
  modelRowId: string | null,
  input: Record<string, string | boolean>,
): Promise<FormResult> {
  const actor = await authorizeAction('providers.manage');
  if (!actor) return forbidden;
  if (
    !idSchema.safeParse(providerId).success ||
    (modelRowId && !idSchema.safeParse(modelRowId).success)
  ) {
    return { ok: false, error: 'invalid' };
  }
  const parsed = modelFormSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: 'invalid', fieldErrors: fieldErrorsOf(parsed.error) };
  const data = parsed.data;
  const values = {
    modelId: data.modelId,
    displayName: data.displayName,
    kind: data.kind,
    capabilities: {
      tools: data.tools,
      vision: data.vision,
      json: data.json,
      reasoning: data.reasoning,
    },
    contextWindow: data.contextWindow,
    languages: data.languages,
    costInPer1M: decimalOrNull(data.costInPer1M),
    costOutPer1M: decimalOrNull(data.costOutPer1M),
    priceInPer1M: decimalOrNull(data.priceInPer1M),
    priceOutPer1M: decimalOrNull(data.priceOutPer1M),
    visible: data.visible,
    enabled: data.enabled,
  };
  try {
    if (modelRowId) {
      const { count } = await db().aiModel.updateMany({
        where: { id: modelRowId, providerId },
        data: values,
      });
      if (count === 0) return { ok: false, error: 'notFound' };
    } else {
      const created = await db().aiModel.create({ data: { providerId, ...values } });
      modelRowId = created.id;
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { ok: false, error: 'invalid', fieldErrors: { modelId: 'duplicateModel' } };
    }
    throw error;
  }
  await audit('ai.model_saved', {
    actorId: actor.id,
    target: `model:${modelRowId}`,
    meta: { enabled: data.enabled, visible: data.visible },
  });
  refresh();
  return { ok: true, id: modelRowId };
}

export async function deleteModel(modelRowId: string): Promise<FormResult> {
  const actor = await authorizeAction('providers.manage');
  if (!actor) return forbidden;
  if (!idSchema.safeParse(modelRowId).success) return { ok: false, error: 'invalid' };
  const { count } = await db().aiModel.deleteMany({ where: { id: modelRowId } });
  if (count === 0) return { ok: false, error: 'notFound' };
  await audit('ai.model_deleted', { actorId: actor.id, target: `model:${modelRowId}` });
  refresh();
  return { ok: true };
}

export async function setAiDisabled(disabled: boolean): Promise<FormResult> {
  const actor = await authorizeAction('providers.manage');
  if (!actor) return forbidden;
  await db().setting.upsert(settingUpsert('ai.disabled', disabled, actor.id));
  await audit(disabled ? 'ai.kill_switch_on' : 'ai.kill_switch_off', { actorId: actor.id });
  refresh();
  return { ok: true };
}
