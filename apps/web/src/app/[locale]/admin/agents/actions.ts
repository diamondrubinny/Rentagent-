'use server';

import { AGENT_TEMPLATES } from '@rentagent/agent-runtime';
import { enqueueRun, getServerEnv, rateLimit } from '@rentagent/core';
import { Prisma } from '@rentagent/db';
import {
  type AgentConfig,
  agentConfigSchema,
  agentExportSchema,
  agentMetaSchema,
  defaultAgentConfig,
  isBuiltinLocale,
  runInputSchema,
} from '@rentagent/shared';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { authorizeAction } from '@/lib/server/admin-action';
import { audit } from '@/lib/server/audit';
import { db, redis } from '@/lib/server/runtime';
import type { FormResult } from '../providers/actions';

const uuid = z.uuid();
const forbidden = { ok: false, error: 'forbidden' } as const;
const refresh = () => revalidatePath('/[locale]/admin', 'layout');

function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) errors[issue.path.join('.') || 'form'] ??= issue.message;
  return errors;
}

/** Finds a free slug: "name", "name-2", "name-3", ... */
async function uniqueSlug(base: string): Promise<string> {
  const clean =
    base
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 70) || 'agent';
  for (let suffix = 1; suffix < 100; suffix++) {
    const slug = suffix === 1 ? clean : `${clean}-${suffix}`;
    if (!(await db().agent.findUnique({ where: { slug }, select: { id: true } }))) return slug;
  }
  return `${clean}-${Date.now()}`;
}

/** Tool references must point at existing, enabled HTTP tools / MCP servers. */
async function validateToolRefs(config: AgentConfig): Promise<string | null> {
  const httpIds = config.tools
    .filter((tool) => tool.id.startsWith('http:'))
    .map((tool) => tool.id.slice(5));
  const mcpIds = config.tools
    .filter((tool) => tool.id.startsWith('mcp:'))
    .map((tool) => tool.id.slice(4));
  if (
    httpIds.length &&
    (await db().httpTool.count({ where: { id: { in: httpIds } } })) !== httpIds.length
  )
    return 'unknownTool';
  if (
    mcpIds.length &&
    (await db().mcpServer.count({ where: { id: { in: mcpIds } } })) !== mcpIds.length
  )
    return 'unknownTool';
  if (
    config.target.type === 'policy' &&
    !(await db().routingPolicy.findUnique({ where: { id: config.target.id } }))
  )
    return 'unknownTarget';
  if (
    config.target.type === 'model' &&
    !(await db().aiModel.findUnique({ where: { id: config.target.id } }))
  )
    return 'unknownTarget';
  return null;
}

export async function createAgent(templateKey: string | null): Promise<FormResult> {
  const actor = await authorizeAction('agents.manage');
  if (!actor) return forbidden;
  const template = templateKey
    ? AGENT_TEMPLATES.find((candidate) => candidate.key === templateKey)
    : null;
  if (templateKey && !template) return { ok: false, error: 'invalid' };
  const agent = await db().agent.create({
    data: template
      ? {
          slug: await uniqueSlug(template.slug),
          name: template.name.en,
          category: template.category,
          description: template.description.en,
          localizations: Object.fromEntries(
            (['he', 'ar', 'ru'] as const).map((locale) => [
              locale,
              { name: template.name[locale], description: template.description[locale] },
            ]),
          ),
          draft: template.config as object,
          templateKey: template.key,
          createdById: actor.id,
        }
      : {
          slug: await uniqueSlug('new-agent'),
          name: 'New agent',
          category: 'other',
          draft: defaultAgentConfig() as object,
          createdById: actor.id,
        },
  });
  await audit('agents.created', {
    actorId: actor.id,
    target: `agent:${agent.id}`,
    meta: { template: templateKey },
  });
  refresh();
  return { ok: true, id: agent.id };
}

export async function importAgent(json: string): Promise<FormResult> {
  const actor = await authorizeAction('agents.manage');
  if (!actor) return forbidden;
  if (json.length > 200_000) return { ok: false, error: 'tooLarge' };
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { ok: false, error: 'invalidJson' };
  }
  const parsed = agentExportSchema.safeParse(data);
  if (!parsed.success)
    return { ok: false, error: 'invalidAgentFile', fieldErrors: fieldErrorsOf(parsed.error) };
  const imported = parsed.data;
  // References to tools/models of another installation do not exist here: drop them.
  const config: AgentConfig = {
    ...imported.config,
    tools: imported.config.tools.filter((tool) => !tool.id.includes(':')),
    target: { type: 'default' },
  };
  const agent = await db().agent.create({
    data: {
      slug: await uniqueSlug(imported.slug),
      name: imported.name,
      category: imported.category,
      description: imported.description,
      localizations: imported.localizations,
      draft: config as object,
      createdById: actor.id,
    },
  });
  await audit('agents.imported', { actorId: actor.id, target: `agent:${agent.id}` });
  refresh();
  return { ok: true, id: agent.id };
}

export async function updateAgentMeta(agentId: string, input: unknown): Promise<FormResult> {
  const actor = await authorizeAction('agents.manage');
  if (!actor) return forbidden;
  if (!uuid.safeParse(agentId).success) return { ok: false, error: 'invalid' };
  const parsed = agentMetaSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: 'invalid', fieldErrors: fieldErrorsOf(parsed.error) };
  try {
    await db().agent.update({ where: { id: agentId }, data: parsed.data });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { ok: false, error: 'invalid', fieldErrors: { slug: 'duplicateSlug' } };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025')
      return { ok: false, error: 'notFound' };
    throw error;
  }
  await audit('agents.meta_updated', { actorId: actor.id, target: `agent:${agentId}` });
  refresh();
  return { ok: true };
}

export async function saveDraft(agentId: string, input: unknown): Promise<FormResult> {
  const actor = await authorizeAction('agents.manage');
  if (!actor) return forbidden;
  if (!uuid.safeParse(agentId).success) return { ok: false, error: 'invalid' };
  const parsed = agentConfigSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: 'invalid', fieldErrors: fieldErrorsOf(parsed.error) };
  const refError = await validateToolRefs(parsed.data);
  if (refError) return { ok: false, error: refError };
  const { count } = await db().agent.updateMany({
    where: { id: agentId },
    data: { draft: parsed.data as object },
  });
  if (count === 0) return { ok: false, error: 'notFound' };
  await audit('agents.draft_saved', { actorId: actor.id, target: `agent:${agentId}` });
  refresh();
  return { ok: true };
}

export async function publishAgent(agentId: string, note: string): Promise<FormResult> {
  const actor = await authorizeAction('agents.manage');
  if (!actor) return forbidden;
  if (!uuid.safeParse(agentId).success) return { ok: false, error: 'invalid' };
  const agent = await db().agent.findUnique({ where: { id: agentId } });
  if (!agent) return { ok: false, error: 'notFound' };
  const parsed = agentConfigSchema.safeParse(agent.draft);
  if (!parsed.success) return { ok: false, error: 'invalidDraft' };
  const refError = await validateToolRefs(parsed.data);
  if (refError) return { ok: false, error: refError };

  const version = await db().$transaction(async (tx) => {
    const last = await tx.agentVersion.findFirst({
      where: { agentId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const created = await tx.agentVersion.create({
      data: {
        agentId,
        version: (last?.version ?? 0) + 1,
        config: parsed.data as object,
        note: note.trim().slice(0, 300) || null,
        createdById: actor.id,
      },
    });
    await tx.agent.update({
      where: { id: agentId },
      data: { publishedVersionId: created.id, status: 'PUBLISHED' },
    });
    return created;
  });
  await audit('agents.published', {
    actorId: actor.id,
    target: `agent:${agentId}`,
    meta: { version: version.version },
  });
  refresh();
  return { ok: true, values: { version: version.version } };
}

export async function restoreVersion(versionId: string): Promise<FormResult> {
  const actor = await authorizeAction('agents.manage');
  if (!actor) return forbidden;
  if (!uuid.safeParse(versionId).success) return { ok: false, error: 'invalid' };
  const version = await db().agentVersion.findUnique({ where: { id: versionId } });
  if (!version) return { ok: false, error: 'notFound' };
  await db().agent.update({
    where: { id: version.agentId },
    data: { draft: version.config as object },
  });
  await audit('agents.version_restored', {
    actorId: actor.id,
    target: `agent:${version.agentId}`,
    meta: { version: version.version },
  });
  refresh();
  return { ok: true };
}

export async function setAgentStatus(agentId: string, status: string): Promise<FormResult> {
  const actor = await authorizeAction('agents.manage');
  if (!actor) return forbidden;
  if (!uuid.safeParse(agentId).success || !['PUBLISHED', 'PAUSED', 'ARCHIVED'].includes(status))
    return { ok: false, error: 'invalid' };
  const agent = await db().agent.findUnique({
    where: { id: agentId },
    select: { publishedVersionId: true },
  });
  if (!agent) return { ok: false, error: 'notFound' };
  if (status === 'PUBLISHED' && !agent.publishedVersionId)
    return { ok: false, error: 'notPublished' };
  await db().agent.update({
    where: { id: agentId },
    data: { status: status as 'PUBLISHED' | 'PAUSED' | 'ARCHIVED' },
  });
  await audit('agents.status_changed', {
    actorId: actor.id,
    target: `agent:${agentId}`,
    meta: { status },
  });
  refresh();
  return { ok: true };
}

export async function deleteAgent(agentId: string): Promise<FormResult> {
  const actor = await authorizeAction('agents.manage');
  if (!actor) return forbidden;
  if (!uuid.safeParse(agentId).success) return { ok: false, error: 'invalid' };
  const { count } = await db().agent.deleteMany({ where: { id: agentId } });
  if (count === 0) return { ok: false, error: 'notFound' };
  await audit('agents.deleted', { actorId: actor.id, target: `agent:${agentId}` });
  refresh();
  return { ok: true };
}

export async function deleteKnowledgeSource(sourceId: string): Promise<FormResult> {
  const actor = await authorizeAction('agents.manage');
  if (!actor) return forbidden;
  if (!uuid.safeParse(sourceId).success) return { ok: false, error: 'invalid' };
  const source = await db().knowledgeSource.findUnique({ where: { id: sourceId } });
  if (!source) return { ok: false, error: 'notFound' };
  await db().knowledgeSource.delete({ where: { id: sourceId } });
  await audit('agents.knowledge_removed', {
    actorId: actor.id,
    target: `agent:${source.agentId}`,
    meta: { fileId: source.fileId },
  });
  refresh();
  return { ok: true };
}

/** Starts a preview run (draft or published version) for staff testing. */
export async function startPreviewRun(
  agentId: string,
  input: Record<string, string>,
  options: { useDraft: boolean; locale: string },
): Promise<FormResult> {
  const actor = await authorizeAction('agents.manage');
  if (!actor) return forbidden;
  if (!uuid.safeParse(agentId).success) return { ok: false, error: 'invalid' };
  const limit = await rateLimit(redis(), `preview-run:${actor.id}`, 10, 60);
  if (!limit.allowed) return { ok: false, error: 'rateLimited' };

  const agent = await db().agent.findUnique({ where: { id: agentId } });
  if (!agent) return { ok: false, error: 'notFound' };
  let config: AgentConfig;
  let agentVersionId: string | null = null;
  if (options.useDraft) {
    const parsed = agentConfigSchema.safeParse(agent.draft);
    if (!parsed.success) return { ok: false, error: 'invalidDraft' };
    config = parsed.data;
  } else {
    if (!agent.publishedVersionId) return { ok: false, error: 'notPublished' };
    const version = await db().agentVersion.findUniqueOrThrow({
      where: { id: agent.publishedVersionId },
    });
    config = agentConfigSchema.parse(version.config);
    agentVersionId = version.id;
  }
  const parsedInput = runInputSchema(config.inputFields).safeParse(input);
  if (!parsedInput.success)
    return { ok: false, error: 'invalid', fieldErrors: fieldErrorsOf(parsedInput.error) };

  const run = await db().run.create({
    data: {
      agentId,
      agentVersionId,
      config: config as object,
      userId: actor.id,
      mode: 'PREVIEW',
      locale: isBuiltinLocale(options.locale) ? options.locale : 'en',
      input: parsedInput.data as object,
    },
  });
  await enqueueRun(getServerEnv().REDIS_URL, run.id);
  await audit('agents.preview_started', {
    actorId: actor.id,
    target: `run:${run.id}`,
    meta: { agentId, draft: options.useDraft },
  });
  return { ok: true, id: run.id };
}

export async function cancelRun(runId: string): Promise<FormResult> {
  const actor = await authorizeAction('agents.manage');
  if (!actor) return forbidden;
  if (!uuid.safeParse(runId).success) return { ok: false, error: 'invalid' };
  const run = await db().run.findUnique({ where: { id: runId }, select: { status: true } });
  if (!run) return { ok: false, error: 'notFound' };
  if (run.status === 'WAITING_APPROVAL' || run.status === 'QUEUED') {
    // Not being executed right now: cancel directly.
    await db().run.update({
      where: { id: runId },
      data: { status: 'CANCELED', cancelRequested: true, finishedAt: new Date() },
    });
    await db().approval.updateMany({
      where: { runId, status: 'PENDING' },
      data: { status: 'REJECTED', decidedById: actor.id, decidedAt: new Date() },
    });
    await redis().publish(`run:${runId}`, JSON.stringify({ type: 'status', status: 'CANCELED' }));
  } else if (run.status === 'RUNNING') {
    await db().run.update({ where: { id: runId }, data: { cancelRequested: true } });
  } else {
    return { ok: false, error: 'alreadyFinished' };
  }
  await audit('runs.cancel_requested', { actorId: actor.id, target: `run:${runId}` });
  return { ok: true };
}

export async function decideApproval(approvalId: string, approve: boolean): Promise<FormResult> {
  const actor = await authorizeAction('agents.manage');
  if (!actor) return forbidden;
  if (!uuid.safeParse(approvalId).success) return { ok: false, error: 'invalid' };
  const decided = await db().$transaction(async (tx) => {
    const approval = await tx.approval.findUnique({
      where: { id: approvalId },
      include: { run: { select: { status: true } } },
    });
    if (!approval) return null;
    if (approval.status !== 'PENDING' || approval.run.status !== 'WAITING_APPROVAL')
      return 'stale' as const;
    await tx.approval.update({
      where: { id: approvalId },
      data: {
        status: approve ? 'APPROVED' : 'REJECTED',
        decidedById: actor.id,
        decidedAt: new Date(),
      },
    });
    const stillPending = await tx.approval.count({
      where: { runId: approval.runId, status: 'PENDING' },
    });
    if (stillPending === 0)
      await tx.run.update({ where: { id: approval.runId }, data: { status: 'QUEUED' } });
    return { runId: approval.runId, resume: stillPending === 0, toolName: approval.toolName };
  });
  if (decided === null) return { ok: false, error: 'notFound' };
  if (decided === 'stale') return { ok: false, error: 'alreadyDecided' };
  if (decided.resume) await enqueueRun(getServerEnv().REDIS_URL, decided.runId);
  await audit(approve ? 'runs.action_approved' : 'runs.action_rejected', {
    actorId: actor.id,
    target: `run:${decided.runId}`,
    meta: { tool: decided.toolName },
  });
  return { ok: true };
}
