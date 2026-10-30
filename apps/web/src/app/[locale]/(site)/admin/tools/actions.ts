'use server';

import { randomUUID } from 'node:crypto';
import { discoverMcpTools } from '@rentagent/agent-runtime';
import { checkEndpointUrl } from '@rentagent/ai-gateway';
import {
  decryptSecret,
  encryptSecret,
  enqueueFileJob,
  enqueueSystemJob,
  getServerEnv,
} from '@rentagent/core';
import { Prisma, settingUpsert } from '@rentagent/db';
import { normalizeSingleLine } from '@rentagent/shared';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { authorizeAction } from '@/lib/server/admin-action';
import { audit } from '@/lib/server/audit';
import { db, encryptionKeyring } from '@/lib/server/runtime';
import type { FormResult } from '../providers/actions';

const uuid = z.uuid();
const forbidden = { ok: false, error: 'forbidden' } as const;
const refresh = () => revalidatePath('/[locale]/admin', 'layout');
const text = (max: number) =>
  z
    .string()
    .transform(normalizeSingleLine)
    .pipe(z.string().min(1, { error: 'required' }).max(max, { error: 'tooLong' }));

function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) errors[String(issue.path[0] ?? 'form')] ??= issue.message;
  return errors;
}

const httpToolSchema = z.object({
  name: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{2,40}$/, { error: 'invalidToolName' }),
  description: text(1000),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], { error: 'invalidOption' }),
  urlTemplate: z.string().trim().max(1000, { error: 'tooLong' }),
  inputSchema: z.string().max(20_000, { error: 'tooLong' }),
  /** One "Header: value" per line; empty keeps existing headers when editing. */
  headers: z.string().max(10_000, { error: 'tooLong' }),
  enabled: z.boolean(),
});

function parseHeaders(raw: string): Record<string, string> | null {
  const headers: Record<string, string> = {};
  for (const line of raw
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean)) {
    const index = line.indexOf(':');
    if (index < 1) return null;
    const name = line.slice(0, index).trim();
    if (!/^[A-Za-z0-9-]{1,64}$/.test(name)) return null;
    headers[name.toLowerCase()] = line.slice(index + 1).trim();
  }
  return headers;
}

export async function saveHttpTool(
  toolId: string | null,
  input: Record<string, string | boolean>,
): Promise<FormResult> {
  const actor = await authorizeAction('settings.manage');
  if (!actor) return forbidden;
  if (toolId && !uuid.safeParse(toolId).success) return { ok: false, error: 'invalid' };
  const parsed = httpToolSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: 'invalid', fieldErrors: fieldErrorsOf(parsed.error) };
  const data = parsed.data;

  // The host is fixed: placeholders may only appear after the origin.
  let template: URL;
  try {
    template = new URL(data.urlTemplate.replace(/\{[a-zA-Z_][a-zA-Z0-9_]*\}/g, 'x'));
  } catch {
    return { ok: false, error: 'invalid', fieldErrors: { urlTemplate: 'url_invalid' } };
  }
  const prefix = data.urlTemplate.slice(
    0,
    data.urlTemplate.indexOf('/', template.protocol.length + 2) + 1 || data.urlTemplate.length,
  );
  if (/\{/.test(prefix))
    return { ok: false, error: 'invalid', fieldErrors: { urlTemplate: 'hostPlaceholder' } };
  const check = await checkEndpointUrl(template.origin);
  if (!check.ok)
    return { ok: false, error: 'invalid', fieldErrors: { urlTemplate: `url_${check.reason}` } };

  let schema: Record<string, unknown>;
  try {
    schema = JSON.parse(data.inputSchema || '{"type":"object","properties":{}}') as Record<
      string,
      unknown
    >;
  } catch {
    return { ok: false, error: 'invalid', fieldErrors: { inputSchema: 'invalidJson' } };
  }
  if (schema.type !== 'object')
    return { ok: false, error: 'invalid', fieldErrors: { inputSchema: 'schemaObject' } };
  const headers = parseHeaders(data.headers);
  if (headers === null)
    return { ok: false, error: 'invalid', fieldErrors: { headers: 'invalidHeaders' } };

  const id = toolId ?? randomUUID();
  const values = {
    name: data.name,
    description: data.description,
    method: data.method,
    urlTemplate: data.urlTemplate,
    inputSchema: schema as object,
    enabled: data.enabled,
    ...(data.headers.trim()
      ? {
          headersEncrypted: encryptSecret(
            JSON.stringify(headers),
            `http-tool:${id}`,
            encryptionKeyring(),
          ),
        }
      : {}),
  };
  try {
    if (toolId) await db().httpTool.update({ where: { id: toolId }, data: values });
    else await db().httpTool.create({ data: { id, ...values } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { ok: false, error: 'invalid', fieldErrors: { name: 'duplicateName' } };
    }
    throw error;
  }
  await audit('tools.http_saved', {
    actorId: actor.id,
    target: `http-tool:${id}`,
    meta: { method: data.method, host: template.host },
  });
  refresh();
  return { ok: true, id };
}

export async function deleteHttpTool(toolId: string): Promise<FormResult> {
  const actor = await authorizeAction('settings.manage');
  if (!actor) return forbidden;
  if (!uuid.safeParse(toolId).success) return { ok: false, error: 'invalid' };
  const { count } = await db().httpTool.deleteMany({ where: { id: toolId } });
  if (count === 0) return { ok: false, error: 'notFound' };
  await audit('tools.http_deleted', { actorId: actor.id, target: `http-tool:${toolId}` });
  refresh();
  return { ok: true };
}

const mcpSchema = z.object({
  name: text(80),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{1,30}$/, { error: 'invalidSlug' }),
  url: z.string().trim().max(500, { error: 'tooLong' }),
  auth: z.string().max(4000, { error: 'tooLong' }),
  enabled: z.boolean(),
});

export async function saveMcpServer(
  serverId: string | null,
  input: Record<string, string | boolean>,
): Promise<FormResult> {
  const actor = await authorizeAction('settings.manage');
  if (!actor) return forbidden;
  if (serverId && !uuid.safeParse(serverId).success) return { ok: false, error: 'invalid' };
  const parsed = mcpSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: 'invalid', fieldErrors: fieldErrorsOf(parsed.error) };
  const check = await checkEndpointUrl(parsed.data.url);
  if (!check.ok)
    return { ok: false, error: 'invalid', fieldErrors: { url: `url_${check.reason}` } };
  const id = serverId ?? randomUUID();
  const values = {
    name: parsed.data.name,
    slug: parsed.data.slug,
    url: check.url,
    enabled: parsed.data.enabled,
    ...(parsed.data.auth.trim()
      ? {
          authEncrypted: encryptSecret(
            parsed.data.auth.trim(),
            `mcp-server:${id}`,
            encryptionKeyring(),
          ),
        }
      : {}),
  };
  try {
    if (serverId) await db().mcpServer.update({ where: { id: serverId }, data: values });
    else await db().mcpServer.create({ data: { id, ...values } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { ok: false, error: 'invalid', fieldErrors: { slug: 'duplicateName' } };
    }
    throw error;
  }
  await audit('tools.mcp_saved', { actorId: actor.id, target: `mcp-server:${id}` });
  refresh();
  return { ok: true, id };
}

export async function refreshMcpTools(serverId: string): Promise<FormResult> {
  const actor = await authorizeAction('settings.manage');
  if (!actor) return forbidden;
  if (!uuid.safeParse(serverId).success) return { ok: false, error: 'invalid' };
  const server = await db().mcpServer.findUnique({ where: { id: serverId } });
  if (!server) return { ok: false, error: 'notFound' };
  try {
    const tools = await discoverMcpTools({
      url: server.url,
      auth: server.authEncrypted
        ? decryptSecret(server.authEncrypted, `mcp-server:${server.id}`, encryptionKeyring())
        : null,
    });
    await db().mcpServer.update({
      where: { id: serverId },
      data: { toolCache: tools as object[], toolCacheUpdatedAt: new Date() },
    });
    await audit('tools.mcp_refreshed', {
      actorId: actor.id,
      target: `mcp-server:${serverId}`,
      meta: { tools: tools.length },
    });
    refresh();
    return { ok: true, values: { count: tools.length } };
  } catch {
    return { ok: false, error: 'mcpUnreachable' };
  }
}

export async function deleteMcpServer(serverId: string): Promise<FormResult> {
  const actor = await authorizeAction('settings.manage');
  if (!actor) return forbidden;
  if (!uuid.safeParse(serverId).success) return { ok: false, error: 'invalid' };
  const { count } = await db().mcpServer.deleteMany({ where: { id: serverId } });
  if (count === 0) return { ok: false, error: 'notFound' };
  await audit('tools.mcp_deleted', { actorId: actor.id, target: `mcp-server:${serverId}` });
  refresh();
  return { ok: true };
}

export async function setEmbeddingModel(modelId: string): Promise<FormResult> {
  const actor = await authorizeAction('providers.manage');
  if (!actor) return forbidden;
  if (!uuid.safeParse(modelId).success) return { ok: false, error: 'invalid' };
  const model = await db().aiModel.findFirst({ where: { id: modelId, kind: 'EMBEDDING' } });
  if (!model) return { ok: false, error: 'notFound' };
  const previous = await db().setting.findUnique({ where: { key: 'ai.embeddingModelId' } });
  await db().setting.upsert(settingUpsert('ai.embeddingModelId', modelId, actor.id));
  if (previous?.value !== modelId) {
    // Vectors of another model are not comparable: re-embed agents and knowledge.
    const redisUrl = getServerEnv().REDIS_URL;
    await enqueueSystemJob(redisUrl, { name: 'reindex-agents', data: {} });
    const sources = await db().knowledgeSource.findMany({
      where: {
        OR: [{ status: 'READY' }, { status: 'FAILED', error: 'no_embedding_model' }],
        file: { scanStatus: { in: ['CLEAN', 'SKIPPED'] } },
      },
      select: { id: true },
    });
    for (const source of sources)
      await enqueueFileJob(redisUrl, { kind: 'ingest', sourceId: source.id });
  }
  await audit('ai.embedding_model_set', { actorId: actor.id, target: `model:${modelId}` });
  refresh();
  return { ok: true };
}
