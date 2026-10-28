import { getLogger, getServerEnv } from '@rentagent/core';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';

const QUEUE_SYSTEM = 'system';
const HEARTBEAT_KEY = 'worker:heartbeat';
const HEARTBEAT_EVERY_MS = 15_000;
const HEARTBEAT_TTL_SECONDS = 45;

const log = getLogger({ service: 'worker' });
const env = getServerEnv();

// BullMQ requires maxRetriesPerRequest: null for blocking connections.
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

async function beat(): Promise<void> {
  await connection.set(HEARTBEAT_KEY, new Date().toISOString(), 'EX', HEARTBEAT_TTL_SECONDS);
}

const systemQueue = new Queue(QUEUE_SYSTEM, { connection });

const systemWorker = new Worker(
  QUEUE_SYSTEM,
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
);

systemWorker.on('failed', (job, error) => {
  log.error({ jobId: job?.id, job: job?.name, err: error }, 'job failed');
});

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
  await systemWorker.close();
  await systemQueue.close();
  await connection.quit();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

main().catch((error: unknown) => {
  log.fatal({ err: error }, 'worker failed to start');
  process.exit(1);
});
