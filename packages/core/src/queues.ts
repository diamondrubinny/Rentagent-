import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

export const QUEUE_NAMES = {
  system: 'system',
  mail: 'mail',
  runs: 'agent-runs',
  files: 'files',
} as const;

export interface RunJob {
  runId: string;
}

export type FileJob = { kind: 'scan'; fileId: string } | { kind: 'ingest'; sourceId: string };

export const MAIL_TEMPLATES = [
  'verifyEmail',
  'resetPassword',
  'accountExists',
  'passwordChanged',
  'twoFactorDisabled',
  /** Message composed by an AI agent (after approval); has no button. */
  'agentMessage',
] as const;
export type MailTemplate = (typeof MAIL_TEMPLATES)[number];

export interface MailJob {
  to: string;
  template: MailTemplate;
  locale: string;
  /** Template variables. URLs may contain one-time tokens: jobs are deleted on completion. */
  vars: Record<string, string>;
}

const globalForQueues = globalThis as unknown as {
  rentagentMailQueue?: Queue<MailJob>;
  rentagentRunQueue?: Queue<RunJob>;
  rentagentFileQueue?: Queue<FileJob>;
};

export function getMailQueue(redisUrl: string): Queue<MailJob> {
  globalForQueues.rentagentMailQueue ??= new Queue<MailJob>(QUEUE_NAMES.mail, {
    connection: new Redis(redisUrl, { maxRetriesPerRequest: null }),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 15_000 },
      removeOnComplete: true,
      // Failed jobs are kept briefly for diagnosis; their tokens expire within 24 hours anyway.
      removeOnFail: { age: 24 * 60 * 60 },
    },
  });
  return globalForQueues.rentagentMailQueue;
}

export async function enqueueMail(redisUrl: string, job: MailJob): Promise<void> {
  await getMailQueue(redisUrl).add(job.template, job);
}

export async function enqueueRun(redisUrl: string, runId: string): Promise<void> {
  globalForQueues.rentagentRunQueue ??= new Queue<RunJob>(QUEUE_NAMES.runs, {
    connection: new Redis(redisUrl, { maxRetriesPerRequest: null }),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: true,
      removeOnFail: 500,
    },
  });
  // A unique job id per enqueue lets a run be resumed after approval while older jobs are done.
  await globalForQueues.rentagentRunQueue.add(
    'run',
    { runId },
    { jobId: `${runId}-${Date.now()}` },
  );
}

export async function enqueueFileJob(redisUrl: string, job: FileJob): Promise<void> {
  globalForQueues.rentagentFileQueue ??= new Queue<FileJob>(QUEUE_NAMES.files, {
    connection: new Redis(redisUrl, { maxRetriesPerRequest: null }),
    defaultJobOptions: {
      attempts: 4,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: true,
      removeOnFail: 500,
    },
  });
  await globalForQueues.rentagentFileQueue.add(job.kind, job);
}
