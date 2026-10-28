import { mkdir, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  chunkText,
  extractText,
  type RuntimeDeps,
  scanWithClamd,
  toVectorLiteral,
} from '@rentagent/agent-runtime';
import { embedTexts } from '@rentagent/ai-gateway';
import { enqueueFileJob, type FileJob, QUEUE_NAMES } from '@rentagent/core';
import { getSetting } from '@rentagent/db';
import { type ConnectionOptions, UnrecoverableError, Worker } from 'bullmq';

const EMBED_BATCH = 32;
const MAX_CHUNKS = 5_000;

export const quarantinePath = (dir: string, fileId: string) => join(dir, 'quarantine', fileId);
export const cleanPath = (dir: string, fileId: string) => join(dir, 'clean', fileId);

/** Malware scan → move to clean storage → ingest into the knowledge base. */
export function createFileWorker(
  connection: ConnectionOptions,
  deps: RuntimeDeps,
  options: { filesDir: string; clamavHost: string; clamavPort: number },
): Worker<FileJob> {
  const { db, log } = deps;

  async function scan(fileId: string, finalAttempt: boolean) {
    const file = await db.file.findUnique({ where: { id: fileId } });
    if (!file || file.scanStatus !== 'PENDING') return;
    const source = quarantinePath(options.filesDir, fileId);
    const buffer = await readFile(source);

    let status: 'CLEAN' | 'SKIPPED' = 'SKIPPED';
    if (options.clamavHost) {
      const verdict = await scanWithClamd(buffer, options.clamavHost, options.clamavPort);
      if (verdict.status === 'infected') {
        await rm(source, { force: true });
        await db.file.update({ where: { id: fileId }, data: { scanStatus: 'INFECTED' } });
        await db.knowledgeSource.updateMany({
          where: { fileId },
          data: { status: 'FAILED', error: 'infected' },
        });
        await db.auditLog.create({
          data: {
            action: 'files.malware_detected',
            target: `file:${fileId}`,
            meta: { signature: verdict.signature },
          },
        });
        log.warn({ fileId, signature: verdict.signature }, 'malware detected; file deleted');
        return;
      }
      if (verdict.status === 'error') {
        if (finalAttempt) {
          await db.file.update({ where: { id: fileId }, data: { scanStatus: 'ERROR' } });
          await db.knowledgeSource.updateMany({
            where: { fileId },
            data: { status: 'FAILED', error: 'scan_failed' },
          });
          return;
        }
        throw new Error(`scan failed: ${verdict.message}`); // retried with backoff
      }
      status = 'CLEAN';
    }
    await mkdir(join(options.filesDir, 'clean'), { recursive: true });
    await rename(source, cleanPath(options.filesDir, fileId));
    await db.file.update({ where: { id: fileId }, data: { scanStatus: status } });
    const sources = await db.knowledgeSource.findMany({ where: { fileId }, select: { id: true } });
    for (const { id } of sources)
      await enqueueFileJob(deps.redisUrl, { kind: 'ingest', sourceId: id });
  }

  async function ingest(sourceId: string) {
    const source = await db.knowledgeSource.findUnique({
      where: { id: sourceId },
      include: { file: true },
    });
    if (!source || source.status === 'READY') return;
    if (source.file.scanStatus !== 'CLEAN' && source.file.scanStatus !== 'SKIPPED') return;
    const modelId = await getSetting(db, 'ai.embeddingModelId');
    const fail = async (error: string) => {
      await db.knowledgeSource.update({
        where: { id: sourceId },
        data: { status: 'FAILED', error },
      });
      throw new UnrecoverableError(error);
    };
    if (!modelId) return fail('no_embedding_model');
    await db.knowledgeSource.update({
      where: { id: sourceId },
      data: { status: 'PROCESSING', error: null },
    });

    let text: string;
    try {
      text = await extractText(
        await readFile(cleanPath(options.filesDir, source.fileId)),
        source.file.mime,
      );
    } catch {
      return fail('extract_failed');
    }
    const chunks = chunkText(text).slice(0, MAX_CHUNKS);
    if (chunks.length === 0) return fail('empty');

    // Re-ingestion replaces previous chunks atomically per source.
    await db.chunk.deleteMany({ where: { sourceId } });
    for (let offset = 0; offset < chunks.length; offset += EMBED_BATCH) {
      const batch = chunks.slice(offset, offset + EMBED_BATCH);
      const { embeddings } = await embedTexts(deps, modelId, batch, {
        purpose: 'knowledge_ingest',
      });
      for (const [index, content] of batch.entries()) {
        const vector = toVectorLiteral(embeddings[index] ?? []);
        await db.$executeRaw`
          INSERT INTO chunks (source_id, agent_id, idx, content, embedding, embedding_model_id)
          VALUES (${sourceId}::uuid, ${source.agentId}::uuid, ${offset + index}, ${content}, ${vector}::vector, ${modelId}::uuid)`;
      }
    }
    await db.knowledgeSource.update({
      where: { id: sourceId },
      data: { status: 'READY', chunkCount: chunks.length, embeddingModelId: modelId, error: null },
    });
    log.info({ sourceId, chunks: chunks.length }, 'knowledge source ingested');
  }

  return new Worker<FileJob>(
    QUEUE_NAMES.files,
    async (job) => {
      const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (job.data.kind === 'scan') return scan(job.data.fileId, finalAttempt);
      try {
        return await ingest(job.data.sourceId);
      } catch (error) {
        if (finalAttempt && !(error instanceof UnrecoverableError)) {
          await db.knowledgeSource.update({
            where: { id: job.data.sourceId },
            data: { status: 'FAILED', error: 'ingest_failed' },
          });
        }
        throw error;
      }
    },
    { connection, concurrency: 2 },
  );
}
