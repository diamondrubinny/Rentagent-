import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { detectFileType, MAX_UPLOAD_BYTES } from '@rentagent/agent-runtime';
import { enqueueFileJob, getServerEnv, rateLimit } from '@rentagent/core';
import { z } from 'zod';
import { apiUser, isSameOrigin, jsonResponse } from '@/lib/server/api-auth';
import { audit } from '@/lib/server/audit';
import { db, redis } from '@/lib/server/runtime';

export const dynamic = 'force-dynamic';

/**
 * Uploads a knowledge file for an agent. The file goes to quarantine under a random
 * name; the worker scans it, then extracts and embeds the text.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return jsonResponse(403, { error: 'forbidden' });
  const user = await apiUser('agents.manage');
  if (!user) return jsonResponse(403, { error: 'forbidden' });
  const { id: agentId } = await params;
  if (
    !z.uuid().safeParse(agentId).success ||
    !(await db().agent.findUnique({ where: { id: agentId }, select: { id: true } }))
  ) {
    return jsonResponse(404, { error: 'not_found' });
  }
  const limit = await rateLimit(redis(), `upload:${user.id}`, 30, 3600);
  if (!limit.allowed) return jsonResponse(429, { error: 'rate_limited' });
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) return jsonResponse(413, { error: 'too_large' });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonResponse(400, { error: 'invalid' });
  }
  const file = form.get('file');
  if (!(file instanceof File)) return jsonResponse(400, { error: 'invalid' });
  if (file.size === 0) return jsonResponse(400, { error: 'empty' });
  if (file.size > MAX_UPLOAD_BYTES) return jsonResponse(413, { error: 'too_large' });

  const buffer = Buffer.from(await file.arrayBuffer());
  const originalName =
    file.name
      .normalize('NFC')
      .replace(/[\\/\u0000-\u001f]/g, '_')
      .slice(0, 255) || 'file';
  const mime = detectFileType(buffer, originalName);
  if (!mime) return jsonResponse(415, { error: 'unsupported_type' });

  const fileId = randomUUID();
  const dir = join(getServerEnv().FILES_DIR, 'quarantine');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, fileId), buffer, { mode: 0o600 });

  const sha256 = createHash('sha256').update(buffer).digest('hex');
  const source = await db().$transaction(async (tx) => {
    await tx.file.create({
      data: { id: fileId, ownerId: user.id, originalName, mime, size: buffer.length, sha256 },
    });
    return tx.knowledgeSource.create({ data: { agentId, fileId } });
  });
  await enqueueFileJob(getServerEnv().REDIS_URL, { kind: 'scan', fileId });
  await audit('agents.knowledge_uploaded', {
    actorId: user.id,
    target: `agent:${agentId}`,
    meta: { fileId, mime, size: buffer.length },
  });
  return jsonResponse(201, { id: source.id });
}
