import { getLogger, getServerEnv, parseKeyring, QUEUE_NAMES, type RunJob } from '@rentagent/core';
import { getDb } from '@rentagent/db';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { executeRun, type RuntimeDeps } from '@rentagent/agent-runtime';
import { settleOrphanRuns, settleRun } from '@rentagent/billing';
import { createFileWorker } from './files';
import { indexAgent, purgeExpired, reindexAgents } from './maintenance';
import { translateAgent, translateLocale } from './translate';
import { createMailWorker } from './mail';

const HEARTBEAT_KEY = 'worker:heartbeat';
const HEARTBEAT_EVERY_MS = 15_000;
const HEARTBEAT_TTL_SECONDS = 45;

const log = getLogger({ service: 'worker' });
const env = getServerEnv();

// BullMQ requires maxRetriesPerRequest: null for blocking connections.
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const db = getDb(env.DATABASE_URL);
const keyring = parseKeyring(env.APP_ENCRYPTION_KEY, env.APP_ENCRYPTION_KEYS_PREVIOUS);
// A separate non-blocking connection for regular commands (locks, pub/sub publish, counters).
const commands = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3 });
const runtimeDeps: RuntimeDeps = {
  db,
  redis: commands,
  keyring,
  log,
  redisUrl: env.REDIS_URL,
  appUrl: env.APP_URL,
};

async function beat(): Promise<void> {
  await connection.set(HEARTBEAT_KEY, new Date().toISOString(), 'EX', HEARTBEAT_TTL_SECONDS);
}

const systemQueue = new Queue(QUEUE_NAMES.system, { connection });

const workers: Worker[] = [
  new Worker(
    QUEUE_NAMES.system,
    async (job) => {
      switch (job.name) {
        case 'heartbeat':
          await beat();
          return;
        case 'index-agent':
          await indexAgent(runtimeDeps, (job.data as { agentId: string }).agentId);
          return;
        case 'reindex-agents':
          log.info({ agents: await reindexAgents(runtimeDeps) }, 'agents reindexed');
          return;
        case 'retention':
          await settleOrphanRuns(db);
          await purgeExpired(runtimeDeps);
          return;
        case 'translate-locale': {
          const data = job.data as { locale: string; entries: Record<string, string> };
          await translateLocale(runtimeDeps, data.locale, data.entries);
          return;
        }
        case 'translate-agent': {
          const data = job.data as { agentId: string; locales: string[] };
          if (await translateAgent(runtimeDeps, data.agentId, data.locales))
            await indexAgent(runtimeDeps, data.agentId);
          return;
        }
        default:
          throw new Error(`Unknown system job: ${job.name}`);
      }
    },
    // Long jobs (translation, re-indexing) must never starve the heartbeat.
    { connection, concurrency: 4 },
  ),
  createMailWorker({ connection, db, keyring, log }),
  new Worker<RunJob>(
    QUEUE_NAMES.runs,
    async (job) => {
      const { status } = await executeRun(runtimeDeps, job.data.runId);
      // Paid runs: charge the actual price and release the rest of the hold.
      if (status === 'SUCCEEDED' || status === 'FAILED' || status === 'CANCELED')
        await settleRun(db, job.data.runId);
    },
    {
      connection,
      concurrency: env.RUN_CONCURRENCY,
      // Agent runs can take minutes; keep the job lock alive meanwhile.
      lockDuration: 10 * 60 * 1000,
    },
  ),
  createFileWorker(connection, runtimeDeps, {
    filesDir: env.FILES_DIR,
    clamavHost: env.CLAMAV_HOST,
    clamavPort: env.CLAMAV_PORT,
  }),
];

for (const worker of workers) {
  worker.on('failed', (job, error) => {
    log.error(
      { queue: worker.name, jobId: job?.id, job: job?.name, err: error.message },
      'job failed',
    );
  });
}

async function main(): Promise<void> {
  await beat();
  await systemQueue.upsertJobScheduler(
    'heartbeat',
    { every: HEARTBEAT_EVERY_MS },
    { name: 'heartbeat', opts: { removeOnComplete: true, removeOnFail: 100 } },
  );
  await systemQueue.upsertJobScheduler(
    'retention',
    { every: 60 * 60 * 1000, immediately: true },
    { name: 'retention', opts: { removeOnComplete: true, removeOnFail: 100 } },
  );
  // Agents created before search indexing existed (or restored from a backup).
  if (await db.agent.count({ where: { searchText: '' } }))
    await systemQueue.add('reindex-agents', {}, { removeOnComplete: true, removeOnFail: 100 });
  log.info({ version: env.RENTAGENT_VERSION }, 'worker started');
}

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info({ signal }, 'worker shutting down');
  // Let in-flight jobs finish before closing connections.
  await Promise.all(workers.map((worker) => worker.close()));
  await systemQueue.close();
  await db.$disconnect();
  await commands.quit();
  await connection.quit();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

main().catch((error: unknown) => {
  log.fatal({ err: error }, 'worker failed to start');
  process.exit(1);
});
