import { getLogger, getServerEnv, parseKeyring, QUEUE_NAMES, type RunJob } from '@rentagent/core';
import { getDb } from '@rentagent/db';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { executeRun, type RuntimeDeps } from '@rentagent/agent-runtime';
import { createFileWorker } from './files';
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
        default:
          throw new Error(`Unknown system job: ${job.name}`);
      }
    },
    { connection, concurrency: 1 },
  ),
  createMailWorker({ connection, db, keyring, log }),
  new Worker<RunJob>(
    QUEUE_NAMES.runs,
    async (job) => void (await executeRun(runtimeDeps, job.data.runId)),
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
